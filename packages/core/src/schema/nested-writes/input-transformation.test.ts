import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../schema/registry.js'
import { transformSchemaMutationDataInput } from './input-transformation.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Person = UltimaBase.Schema.define({
	className: 'MutationTransformationPerson',
	fields: (field) => ({
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => String(item.name),
			select: { name: true },
		}),
		name: field.string(),
	}),
})

const Article = UltimaBase.Schema.define({
	className: 'MutationTransformationArticle',
	fields: (field) => ({
		author: field.pointer({ target: 'MutationTransformationPerson' }),
		comments: field.relation({ target: 'MutationTransformationPerson' }),
		title: field.string(),
	}),
})

new SchemaRegistry([Article, Person]).resolveSchemaTargets()

describe('transformSchemaMutationDataInput', () => {
	it('classifies fields and traverses nested pointer and relation data', () => {
		const visited: string[] = []
		const transformed = transformSchemaMutationDataInput(
			Article,
			{
				author: {
					create: { label: 'virtual', name: 'Ada', unknown: 'kept' },
				},
				comments: {
					create: [{ name: 'First' }],
					update: [{ data: { name: 'Edited' }, id: 'comment-id' }],
				},
				title: 'Post',
				unknown: 'kept',
			},
			{
				mode: 'create',
				relationships: 'nested',
				transformField: ({ field, kind, mode, relationships, value }) => {
					visited.push(
						`${kind}:${field?.kind ?? 'none'}:${mode}:${relationships}`,
					)
					return field === undefined ||
						(field.kind !== 'pointer' && field.kind !== 'relation')
						? `${mode}:${String(value)}`
						: value
				},
			},
		)

		expect(transformed).toStrictEqual({
			author: {
				create: {
					label: 'create:virtual',
					name: 'create:Ada',
					unknown: 'create:kept',
				},
			},
			comments: {
				create: [{ name: 'create:First' }],
				update: [{ data: { name: 'update:Edited' }, id: 'comment-id' }],
			},
			title: 'create:Post',
			unknown: 'create:kept',
		})
		expect(visited).toStrictEqual([
			'persisted:pointer:create:nested',
			'virtual:none:create:nested',
			'persisted:string:create:nested',
			'unknown:none:create:nested',
			'persisted:relation:create:nested',
			'persisted:string:create:nested',
			'persisted:string:update:nested',
			'persisted:string:create:nested',
			'unknown:none:create:nested',
		])
		expect(Object.isFrozen(transformed)).toBe(true)
	})

	it('leaves malformed nested structures to the callback', () => {
		const values: unknown[] = []
		const transformField = ({ value }: { readonly value: unknown }) => {
			values.push(value)
			return value
		}

		expect(
			transformSchemaMutationDataInput(Article, 1, {
				mode: 'update',
				relationships: 'nested',
				transformField,
			}),
		).toBe(1)
		expect(
			transformSchemaMutationDataInput(
				Article,
				{ author: false, comments: { create: false, update: true } },
				{
					mode: 'update',
					relationships: 'nested',
					transformField,
				},
			),
		).toStrictEqual({
			author: false,
			comments: { create: false, update: true },
		})
		expect(values).toStrictEqual([false, { create: false, update: true }])
	})

	it('classifies inherited names as unknown and keeps an own __proto__ key', () => {
		const inputs: string[] = []
		// `JSON.parse` creates own keys, as a transport body does.
		const transformed = transformSchemaMutationDataInput(
			Article,
			JSON.parse('{"toString":1,"constructor":2,"__proto__":3,"unknown":4}'),
			{
				mode: 'create',
				relationships: 'nested',
				transformField: ({ field, kind, value }) => {
					inputs.push(`${kind}:${field?.kind ?? 'none'}`)
					return value
				},
			},
		)

		// Inherited `Object.prototype` members classify like any undeclared name.
		expect(inputs).toStrictEqual([
			'unknown:none',
			'unknown:none',
			'unknown:none',
			'unknown:none',
		])
		expect(transformed).toBeTypeOf('object')
		if (typeof transformed !== 'object' || transformed === null) return
		expect(Object.keys(transformed)).toStrictEqual([
			'toString',
			'constructor',
			'__proto__',
			'unknown',
		])
		expect(
			Object.getOwnPropertyDescriptor(transformed, '__proto__')?.value,
		).toBe(3)
		expect(Object.getPrototypeOf(transformed)).toBe(Object.prototype)
	})
})
