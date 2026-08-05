import {
	binaryField,
	booleanField,
	Schema,
	enumField,
	intField,
	objectField,
	pointerField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { hydrateQueryFromAst, Query } from './query.js'
import type { QueryScope } from './scope.js'

const postFields = {
	title: stringField(),
	published: booleanField(),
	views: intField(),
	score: intField(),
	status: enumField({ values: ['draft', 'published'] }),
	aliases: stringField({ list: true }),
	metadata: objectField({ fields: { label: stringField() } }),
	attachment: binaryField(),
}

const postSchema = Schema.define({ className: 'Post', fields: postFields })
const includedUserSchema = Schema.define({
	className: 'QueryIncludedUser',
	fields: { name: stringField(), active: booleanField() },
})
const includedPostSchema = Schema.define({
	className: 'QueryIncludedPost',
	fields: {
		author: pointerField({ target: () => includedUserSchema }),
		title: stringField(),
	},
})

describe('Query', () => {
	it('hydrates one internal immutable shell without rebuilding its normalized AST', () => {
		const source = new Query(postSchema)
			.select('id', 'title')
			.equalTo('published', true)
			.limit(25)
		const hydrated = hydrateQueryFromAst<typeof postSchema, 'id' | 'title'>(
			source.ast,
		)
		const branch = hydrated.limit(10)

		expect(hydrated).toBeInstanceOf(Query)
		expect(hydrated).not.toBe(source)
		expect(hydrated.ast).toBe(source.ast)
		expect(hydrated.schema).toBe(postSchema)
		expect(Object.isFrozen(hydrated)).toBe(true)
		expect(branch.ast.limit).toBe(10)
		expect(hydrated.ast.limit).toBe(25)
		expect(source.ast.limit).toBe(25)
		expect(branch.ast.selection).toBe(source.ast.selection)
		expect(branch.ast.where).toBe(source.ast.where)
	})

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

	it('builds immutable pointer inclusion branches from exact target queries', () => {
		const base = new Query(includedPostSchema)
		const included = base.include('author', (query) =>
			query.select('id', 'name').equalTo('active', true),
		)
		const replaced = included.include('author', (query) => query.select('name'))

		expect(base.ast.inclusion.pointers).toStrictEqual([])
		expect(included.ast.inclusion.pointers).toHaveLength(1)
		expect(included.ast.inclusion.pointers[0]).toMatchObject({
			kind: 'included-pointer',
			field: 'author',
			query: {
				kind: 'query',
				selection: {
					fields: [
						{ kind: 'selected-field', field: 'id' },
						{ kind: 'selected-field', field: 'name' },
					],
				},
				where: {
					expression: { kind: 'equal', field: 'active', value: true },
				},
			},
		})
		expect(replaced.ast.inclusion.pointers).toHaveLength(1)
		expect(
			replaced.ast.inclusion.pointers[0]?.query.selection.fields,
		).toStrictEqual([{ kind: 'selected-field', field: 'name' }])
		expect(Object.isFrozen(included.ast.inclusion)).toBe(true)
		expect(Object.isFrozen(included.ast.inclusion.pointers)).toBe(true)
		expect(Object.isFrozen(included.ast.inclusion.pointers[0])).toBe(true)
	})

	it('normalizes pointer identity predicates without physical foreign-key names', () => {
		const author = includedUserSchema.pointer(
			'0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
		)
		const query = new Query(includedPostSchema)
			.equalTo('author', author)
			.containedIn('author', [author])
			.isNull('author')

		expect(query.ast.where?.expression).toMatchObject({
			kind: 'and',
			expressions: [
				{ kind: 'equal', field: 'author', value: author },
				{ kind: 'in', field: 'author', values: [author] },
				{ kind: 'null', field: 'author', isNull: true },
			],
		})
		expect(JSON.stringify(query.ast)).not.toContain('authorId')
	})

	it('keeps logical field names and rejects malformed inclusion callbacks', () => {
		const selected = new Query(includedPostSchema)
			.select('id')
			.include('author', (query) => query.select('name'))

		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'author' },
		])
		expect(JSON.stringify(selected.ast)).toContain('"field":"author"')
		expect(JSON.stringify(selected.ast)).not.toContain('authorId')
		expect(() =>
			new Query(includedPostSchema).include(
				'author',
				// @ts-expect-error -- Runtime validation protects JavaScript callbacks.
				() => immutableScopeFixture,
			),
		).toThrow(
			new TypeError(
				'query inclusion callback must return a Query for the pointer target',
			),
		)
		expect(() =>
			new Query(includedPostSchema).include(
				// @ts-expect-error -- Runtime validation rejects non-pointer fields.
				'title',
				(query) => query,
			),
		).toThrow(
			new TypeError('query inclusion field must reference a pointer field'),
		)
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
			.isNotNull('metadata')
			.isNull('aliases')
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

	it('adds the framework identifier without mutating existing filters', () => {
		const objectId = '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a'
		const expected = new Query(postSchema).equalTo('id', objectId)
		const base = new Query(postSchema).equalTo('published', true)
		const identified = base.byId(objectId)

		expect(new Query(postSchema).byId(objectId).ast.where).toStrictEqual(
			expected.ast.where,
		)

		expect(base.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'published',
			value: true,
		})
		expect(identified.ast.where?.expression).toStrictEqual({
			kind: 'and',
			expressions: [
				{ kind: 'equal', field: 'published', value: true },
				{
					kind: 'equal',
					field: 'id',
					value: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
				},
			],
		})
		expect(identified).not.toBe(base)
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
		const commentSchema = Schema.define({
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
		const otherPostSchema = Schema.define({
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
		expect(() => {
			// @ts-expect-error -- Runtime validation rejects non-string identifiers.
			new Query(postSchema).byId(42)
		}).toThrow(new TypeError('query filter value must be a string'))
	})

	it('snapshots mutable scalar operands and exposes contextual terminals', () => {
		const attachment = new Uint8Array([1, 2, 3])
		const query = new Query(postSchema).equalTo('attachment', attachment)

		attachment[0] = 9

		expect(query.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'attachment',
			value: new Uint8Array([1, 2, 3]),
		})
		expect(query.schema).toBe(postSchema)
		expect(query).not.toHaveProperty('bind')
		expect(query).toHaveProperty('find')
		expect(query).not.toHaveProperty('save')
	})
})

// This frozen fixture models an arbitrary object returned by untyped JavaScript.
const immutableScopeFixture = Object.freeze({ kind: 'not-a-query' })
