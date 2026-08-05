import {
	Schema,
	booleanField,
	enumField,
	intField,
	objectField,
	stringField,
} from '../index.js'
import { describe, expect, it } from 'vitest'

import type { AccessFilter } from './contracts.js'
import {
	combineAccessFilterResults,
	createAccessFilter,
	getAccessFilterExpression,
	normalizeAccessFilterResult,
} from './filter.js'

const articleSchema = Schema.define({
	className: 'AccessFilterArticle',
	fields: {
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
		published: booleanField(),
		score: intField(),
		status: enumField({ values: ['draft', 'published'] }),
		title: stringField(),
		views: intField(),
	},
})

describe('AccessFilter', () => {
	it('builds every Query predicate through one private implicit AND tree', () => {
		const statuses: ('draft' | 'published')[] = ['draft', 'published']
		const flags: ('case-insensitive' | 'multiline')[] = [
			'case-insensitive',
			'case-insensitive',
			'multiline',
		]
		const filter = createAccessFilter(articleSchema)
			.equalTo('published', true)
			.notEqualTo('status', 'draft')
			.greaterThan('views', 10)
			.greaterThanOrEqualTo('views', 11)
			.lessThan('views', 100)
			.lessThanOrEqualTo('views', 99)
			.between('views', 20, 80)
			.notBetween('views', 40, 60)
			.containedIn('status', statuses)
			.notContainedIn('status', ['draft'])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', { source: '^Ultima', flags })
			.isNotNull('metadata')
			.isNull('aliases')
			.equalTo('score', null)

		statuses.push('draft')
		flags.push('multiline')

		const expression = getAccessFilterExpression(articleSchema, filter)

		expect(expression).toMatchObject({ kind: 'and' })
		if (expression?.kind === 'and') {
			expect(expression.expressions).toHaveLength(17)
			expect(expression.expressions[6]).toStrictEqual({
				field: 'views',
				kind: 'between',
				lower: 20,
				upper: 80,
			})
			expect(expression.expressions[7]).toStrictEqual({
				field: 'views',
				kind: 'not-between',
				lower: 40,
				upper: 60,
			})
			expect(expression.expressions[8]).toStrictEqual({
				field: 'status',
				kind: 'in',
				values: ['draft', 'published'],
			})
			expect(expression.expressions[13]).toStrictEqual({
				field: 'title',
				kind: 'regex',
				pattern: {
					flags: ['case-insensitive', 'multiline'],
					source: '^Ultima',
				},
			})
			expect(Object.isFrozen(expression.expressions)).toBe(true)
		}
	})

	it('composes nested logical branches without mutating their sources', () => {
		const base = createAccessFilter(articleSchema)
		const published = base.equalTo('published', true)
		const popular = base.greaterThan('views', 100)
		const discoverable = published.or(popular)
		const moderated = discoverable.not(base.equalTo('status', 'draft'))
		const combined = moderated.and(base.startsWith('title', 'Ultima'))

		expect(getAccessFilterExpression(articleSchema, base)).toBeUndefined()
		expect(getAccessFilterExpression(articleSchema, published)).toStrictEqual({
			field: 'published',
			kind: 'equal',
			value: true,
		})
		expect(getAccessFilterExpression(articleSchema, combined)).toStrictEqual({
			kind: 'and',
			expressions: [
				{
					kind: 'or',
					expressions: [
						{ field: 'published', kind: 'equal', value: true },
						{ field: 'views', kind: 'greater-than', value: 100 },
					],
				},
				{
					kind: 'not',
					expression: { field: 'status', kind: 'equal', value: 'draft' },
				},
				{ field: 'title', kind: 'starts-with', value: 'Ultima' },
			],
		})
		expect(Object.isFrozen(base)).toBe(true)
		expect(Object.isFrozen(combined)).toBe(true)
		expect(Reflect.ownKeys(combined)).toStrictEqual([])
	})

	it('rejects forged and cross-schema filters at the private boundary', () => {
		const commentSchema = Schema.define({
			className: 'AccessFilterComment',
			fields: { body: stringField() },
		})
		const articleFilter = createAccessFilter(articleSchema).equalTo(
			'published',
			true,
		)
		const commentFilter = createAccessFilter(commentSchema).equalTo(
			'body',
			'Comment',
		)

		expect(() => getAccessFilterExpression(articleSchema, {})).toThrow(
			new TypeError('Access filter result must be an AccessFilter'),
		)
		expect(() =>
			getAccessFilterExpression(articleSchema, commentFilter),
		).toThrow(
			new TypeError('Access filter result must use the supplied schema'),
		)
		expect(() =>
			articleFilter.or(
				commentFilter as unknown as AccessFilter<typeof articleSchema>,
			),
		).toThrow(new TypeError('logical Access filters must use the same schema'))
	})

	it('normalizes decisive callback results and combines policies only with AND', () => {
		const published = createAccessFilter(articleSchema).equalTo(
			'published',
			true,
		)
		const popular = createAccessFilter(articleSchema).greaterThan('views', 100)

		expect(normalizeAccessFilterResult(articleSchema, true)).toStrictEqual({
			kind: 'constant',
			value: true,
		})
		expect(normalizeAccessFilterResult(articleSchema, false)).toStrictEqual({
			kind: 'constant',
			value: false,
		})
		expect(
			normalizeAccessFilterResult(
				articleSchema,
				createAccessFilter(articleSchema),
			),
		).toStrictEqual({ kind: 'constant', value: true })
		expect(
			combineAccessFilterResults(articleSchema, [published, popular]),
		).toStrictEqual({
			kind: 'and',
			expressions: [
				{ field: 'published', kind: 'equal', value: true },
				{ field: 'views', kind: 'greater-than', value: 100 },
			],
		})
		expect(combineAccessFilterResults(articleSchema, [])).toStrictEqual({
			kind: 'constant',
			value: true,
		})
		expect(() => normalizeAccessFilterResult(articleSchema, undefined)).toThrow(
			new TypeError('Access filter result must be an AccessFilter'),
		)
		expect(() => normalizeAccessFilterResult(articleSchema, {})).toThrow(
			new TypeError('Access filter result must be an AccessFilter'),
		)
	})

	it('retains Query runtime validation at untyped boundaries', () => {
		const filter = createAccessFilter(articleSchema)

		expect(() => {
			// @ts-expect-error -- Runtime validation still protects JavaScript callers.
			filter.equalTo('published', 'true')
		}).toThrow(TypeError)
		expect(() => {
			// @ts-expect-error -- Membership candidates must remain arrays.
			filter.containedIn('status', 'draft')
		}).toThrow(new TypeError('query membership values must be an array'))
		expect(() => {
			// @ts-expect-error -- Ordered comparisons reject boolean fields.
			filter.greaterThan('published', true)
		}).toThrow(
			new TypeError(
				'query operator greater-than does not support boolean fields',
			),
		)
	})
})
