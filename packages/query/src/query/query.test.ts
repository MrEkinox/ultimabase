import {
	binaryField,
	booleanField,
	Schema,
	enumField,
	intField,
	objectField,
	stringField,
} from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { Query } from './query.js'
import type { QueryScope } from './scope.js'

const postFields = {
	title: stringField(),
	published: booleanField(),
	views: intField(),
	score: intField({ validation: { nullable: true } }),
	status: enumField({ values: ['draft', 'published'] }),
	aliases: stringField({ list: true }),
	metadata: objectField({ fields: { label: stringField() } }),
	attachment: binaryField(),
}

const postSchema = new Schema({ className: 'Post', fields: postFields })

describe('Query', () => {
	it('builds immutable selection, ordering, limit, and pagination branches', () => {
		const base = new Query(postSchema)
		const selected = base.select('title', 'id', 'title')
		const ordered = selected.descending('createdAt', 'title').ascending('title')
		const limited = ordered.limit(25)
		const offset = limited.skip(50)
		const clearedOffset = offset.skip(0)
		const cursor = limited.after('opaque.cursor')
		const firstCursorPage = limited.after()
		const unchangedCursor = cursor.skip(0)

		expect(base.ast.selection.fields).toStrictEqual([])
		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'title' },
			{ kind: 'selected-field', field: 'id' },
		])
		expect(ordered.ast.ordering.orders).toStrictEqual([
			{ kind: 'order', field: 'createdAt', direction: 'descending' },
			{ kind: 'order', field: 'title', direction: 'ascending' },
		])
		expect(limited.ast.limit).toBe(25)
		expect(offset.ast.pagination).toStrictEqual({
			kind: 'offset-pagination',
			skip: 50,
		})
		expect(clearedOffset.ast.pagination).toBeUndefined()
		expect(cursor.ast.pagination).toStrictEqual({
			kind: 'cursor-pagination',
			after: 'opaque.cursor',
		})
		expect(firstCursorPage.ast.pagination).toStrictEqual({
			after: undefined,
			kind: 'cursor-pagination',
		})
		expect(unchangedCursor.ast.pagination).toBe(cursor.ast.pagination)
		expect(base).not.toBe(selected)
		expect(selected).not.toBe(ordered)
		expect(ordered).not.toBe(limited)
		expect(limited).not.toBe(offset)
		expect(limited).not.toBe(cursor)
	})

	it('shares every unchanged immutable AST branch', () => {
		const base = new Query(postSchema).select('title').descending('createdAt')
		const published = base.equalTo('published', true)
		const limited = published.limit(10)
		const noSelectionChange = base.select()
		const noOrderingChange = base.ascending()
		const noOffsetChange = base.skip(0)

		expect(published.ast.schema).toBe(base.ast.schema)
		expect(published.ast.selection).toBe(base.ast.selection)
		expect(published.ast.ordering).toBe(base.ast.ordering)
		expect(limited.ast.where).toBe(published.ast.where)
		expect(limited.ast.selection).toBe(published.ast.selection)
		expect(noSelectionChange).not.toBe(base)
		expect(noOrderingChange).not.toBe(base)
		expect(noOffsetChange).not.toBe(base)
		expect(noSelectionChange.ast.ordering).toBe(base.ast.ordering)
		expect(noOrderingChange.ast.selection).toBe(base.ast.selection)
		expect(noOffsetChange.ast.pagination).toBe(base.ast.pagination)
		expect(Object.isFrozen(base)).toBe(true)
		expect(Object.isFrozen(limited.ast)).toBe(true)
	})

	it('creates every primitive filter through an implicit AND chain', () => {
		const statusValues: ('draft' | 'published')[] = ['draft', 'published']
		const regexFlags: ('case-insensitive' | 'multiline')[] = [
			'case-insensitive',
			'case-insensitive',
			'multiline',
		]
		const query = new Query(postSchema)
			.equalTo('published', true)
			.notEqualTo('status', 'draft')
			.greaterThan('views', 10)
			.greaterThanOrEqualTo('views', 11)
			.lessThan('views', 100)
			.lessThanOrEqualTo('views', 99)
			.containedIn('status', statusValues)
			.notContainedIn('status', ['draft'])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', { source: '^Ultima', flags: regexFlags })
			.exists('metadata')
			.doesNotExist('aliases')
			.equalTo('score', null)

		statusValues.push('draft')
		regexFlags.push('multiline')

		expect(query.ast.where?.expression).toMatchObject({
			kind: 'and',
		})
		if (query.ast.where?.expression.kind === 'and') {
			expect(query.ast.where.expression.expressions).toHaveLength(15)
			expect(query.ast.where.expression.expressions[6]).toStrictEqual({
				kind: 'in',
				field: 'status',
				values: ['draft', 'published'],
			})
			expect(query.ast.where.expression.expressions[11]).toStrictEqual({
				kind: 'regex',
				field: 'title',
				pattern: {
					source: '^Ultima',
					flags: ['case-insensitive', 'multiline'],
				},
			})
			expect(Object.isFrozen(query.ast.where.expression.expressions)).toBe(true)
		}
	})

	it('combines filters from independent branches without copying other clauses', () => {
		const base = new Query(postSchema).limit(25).descending('createdAt')
		const published = new Query(postSchema).equalTo('published', true)
		const popular = new Query(postSchema).greaterThan('views', 100)
		const empty = new Query(postSchema)
		const andQuery = base.and(published).and(popular)
		const orQuery = published.or(popular)
		const notQuery = published.not(popular)
		const adopted = base.or(popular)
		const noFilterChange = base.and(empty)

		expect(andQuery.ast.where?.expression.kind).toBe('and')
		expect(orQuery.ast.where?.expression.kind).toBe('or')
		expect(notQuery.ast.where?.expression).toMatchObject({
			kind: 'and',
			expressions: [
				{ kind: 'equal', field: 'published', value: true },
				{
					kind: 'not',
					expression: { kind: 'greater-than', field: 'views', value: 100 },
				},
			],
		})
		expect(adopted.ast.where?.expression).toBe(popular.ast.where?.expression)
		expect(adopted.ast.limit).toBe(25)
		expect(adopted.ast.ordering).toBe(base.ast.ordering)
		expect(noFilterChange).not.toBe(base)
		expect(noFilterChange.ast.where).toBe(base.ast.where)
	})

	it('composes reusable scopes across immutable query branches', () => {
		const published: QueryScope<typeof postSchema> = (query) =>
			query.equalTo('published', true)
		const popular: QueryScope<typeof postSchema> = (query) =>
			query.greaterThan('views', 100)
		const discoverable: QueryScope<typeof postSchema> = (query) =>
			query.use(published).use(popular).descending('createdAt')
		const base = new Query(postSchema).select('id', 'title')
		const publishedBranch = base.use(published)
		const discoverableBranch = base.use(discoverable)

		expect(base.ast.where).toBeUndefined()
		expect(base.ast.ordering.orders).toStrictEqual([])
		expect(publishedBranch.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'published',
			value: true,
		})
		expect(discoverableBranch.ast.where?.expression).toMatchObject({
			kind: 'and',
		})
		expect(discoverableBranch.ast.ordering.orders).toStrictEqual([
			{ kind: 'order', field: 'createdAt', direction: 'descending' },
		])
		expect(discoverableBranch.ast.selection).toBe(base.ast.selection)
		expect(discoverableBranch).not.toBe(base)
	})

	it('rejects malformed scope results at the JavaScript boundary', () => {
		const commentSchema = new Schema({
			className: 'Comment',
			fields: { body: stringField() },
		})

		expect(() =>
			new Query(postSchema).use(
				// @ts-expect-error -- Runtime validation rejects non-Query scope results.
				() => immutableScopeFixture,
			),
		).toThrow(new TypeError('query scope must return a Query instance'))
		expect(() =>
			new Query(postSchema).use(
				// @ts-expect-error -- Runtime validation repeats exact-schema enforcement.
				() => new Query(commentSchema),
			),
		).toThrow(
			new TypeError('query scope must return the same schema definition'),
		)
	})

	it('rejects incompatible pagination, schemas, fields, operators, and values', () => {
		// The same shape but a different definition proves that identity is enforced.
		const otherPostSchema = new Schema({
			className: 'Post',
			fields: postFields,
		})

		expect(() => new Query(postSchema).skip(5).after('cursor')).toThrow(
			new TypeError('query cannot combine skip and after pagination'),
		)
		expect(() => new Query(postSchema).after('cursor').skip(5)).toThrow(
			new TypeError('query cannot combine skip and after pagination'),
		)
		expect(() =>
			new Query(postSchema)
				.equalTo('published', true)
				.and(new Query(otherPostSchema).equalTo('title', 'Post')),
		).toThrow(
			new TypeError('logical queries must use the same schema definition'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime validation rejects unknown fields.
			new Query(postSchema).equalTo('missing', true)
		}).toThrow(
			new TypeError('query filter field must reference a schema field'),
		)
		expect(() => {
			// @ts-expect-error -- List fields expose only presence operators.
			new Query(postSchema).equalTo('aliases', ['alias'])
		}).toThrow(
			new TypeError('query operator equal does not support list fields'),
		)
		expect(() => {
			// @ts-expect-error -- Boolean fields do not support ordered comparisons.
			new Query(postSchema).greaterThan('published', true)
		}).toThrow(
			new TypeError(
				'query operator greater-than does not support boolean fields',
			),
		)
		expect(() => {
			// @ts-expect-error -- Numeric fields do not support string operators.
			new Query(postSchema).contains('views', '10')
		}).toThrow(
			new TypeError('query operator contains does not support int fields'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime field normalizers reject invalid operands.
			new Query(postSchema).equalTo('published', 'true')
		}).toThrow(TypeError)
	})

	it('snapshots mutable scalar operands and exposes no terminal operations', () => {
		const attachment = new Uint8Array([1, 2, 3])
		const query = new Query(postSchema).equalTo('attachment', attachment)

		attachment[0] = 9

		expect(query.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'attachment',
			value: new Uint8Array([1, 2, 3]),
		})
		expect(query.schema).toBe(postSchema)
		expect(query).toHaveProperty('bind')
		expect(query).not.toHaveProperty('find')
		expect(query).not.toHaveProperty('save')
	})
})

// This frozen fixture models an arbitrary object returned by untyped JavaScript.
const immutableScopeFixture = Object.freeze({ kind: 'not-a-query' })
