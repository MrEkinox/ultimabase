import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../../schema/index.js'
import { transformQueryFilterInput } from './input-transformation.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Person = UltimaBase.Schema.define({
	className: 'FilterTransformationPerson',
	fields: (field) => ({ age: field.int(), name: field.string() }),
})

const Article = UltimaBase.Schema.define({
	className: 'FilterTransformationArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'FilterTransformationPerson' }),
		comments: field.relation({ target: 'FilterTransformationPerson' }),
		profile: field.object({
			fields: (field) => ({
				contact: field.object({
					fields: (field) => ({ age: field.int() }),
				}),
			}),
		}),
		title: field.string(),
	}),
})

new SchemaRegistry([Article, Person]).resolveSchemaTargets()

describe('transformQueryFilterInput', () => {
	it('owns recursive filter structure while delegating only field operands', () => {
		const visited: string[] = []
		const transformed = transformQueryFilterInput(
			Article,
			{
				AND: [
					{
						profile: {
							at: [
								{
									eq: '42',
									path: ['contact', 'age'],
								},
							],
						},
					},
					{
						comments: {
							count: {
								gte: 1,
								where: { age: { lt: '20' } },
							},
							some: { age: { gte: '10' } },
						},
					},
				],
				NOT: { author: { is: { name: { eq: 'Ada' } } } },
				title: { eq: 'Post' },
				unknown: { eq: 'untouched' },
			},
			({ field, operator, source, value }) => {
				const result = `${source}:${field.kind}:${operator}:${String(value)}`
				visited.push(result)
				return result
			},
		)

		expect(transformed).toStrictEqual({
			AND: [
				{
					profile: {
						at: [
							{
								eq: 'structured-path:int:eq:42',
								path: ['contact', 'age'],
							},
						],
					},
				},
				{
					comments: {
						count: {
							gte: 1,
							where: { age: { lt: 'field:int:lt:20' } },
						},
						some: { age: { gte: 'field:int:gte:10' } },
					},
				},
			],
			NOT: { author: { is: { name: { eq: 'field:string:eq:Ada' } } } },
			title: { eq: 'field:string:eq:Post' },
			unknown: { eq: 'untouched' },
		})
		expect(visited).toStrictEqual([
			'structured-path:int:eq:42',
			'field:int:lt:20',
			'field:int:gte:10',
			'field:string:eq:Ada',
			'field:string:eq:Post',
		])
		expect(Object.isFrozen(transformed)).toBe(true)
	})

	it('preserves malformed structural values for the canonical validator', () => {
		const transform = () => {
			throw new Error('operand transformer must not run')
		}

		expect(transformQueryFilterInput(Article, 1, transform)).toBe(1)
		expect(
			transformQueryFilterInput(
				Article,
				{
					AND: true,
					comments: { count: false },
					profile: { at: [{ path: ['missing'], eq: 'raw' }] },
				},
				transform,
			),
		).toStrictEqual({
			AND: true,
			comments: { count: false },
			profile: { at: [{ path: ['missing'], eq: 'raw' }] },
		})
	})

	it('leaves inherited names untouched and keeps an own __proto__ key', () => {
		const visited: string[] = []
		// `JSON.parse` creates own keys, as a transport query string does.
		const input: unknown = JSON.parse(
			'{"toString":{"eq":"1"},"__proto__":{"eq":"2"},' +
				'"profile":{"at":[{"path":["toString"],"eq":"3"}]}}',
		)
		const transformed = transformQueryFilterInput(
			Article,
			input,
			({ operator, value }) => {
				visited.push(`${operator}:${String(value)}`)
				return value
			},
		)

		// Inherited `Object.prototype` members are undeclared like any unknown name.
		expect(visited).toStrictEqual([])
		expect(transformed).toStrictEqual(input)
		expect(transformed).toBeTypeOf('object')
		if (typeof transformed !== 'object' || transformed === null) return
		expect(
			Object.getOwnPropertyDescriptor(transformed, '__proto__')?.value,
		).toStrictEqual({ eq: '2' })
		expect(Object.getPrototypeOf(transformed)).toBe(Object.prototype)
	})
})
