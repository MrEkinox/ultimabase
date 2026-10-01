import {
	binaryField,
	booleanField,
	SchemaRegistry,
	enumField,
	intField,
	jsonField,
	objectField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { hydrateQueryFromAst, QueryBuilder } from './query.js'
import { fieldPath } from '../filters/factory.js'
import { WhereBuilder } from '../filters/where.js'
import type { QueryScope } from './scope.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const postFields = {
	title: stringField(),
	published: booleanField(),
	views: intField(),
	score: intField(),
	status: enumField({ values: ['draft', 'published'] }),
	aliases: stringField({ list: true }),
	metadata: objectField({ fields: { label: stringField() } }),
	payload: jsonField(),
	attachment: binaryField(),
}

const postSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: () => postFields,
})
const includedUserSchema = UltimaBase.Schema.define({
	className: 'QueryIncludedUser',
	fields: (field) => ({ name: field.string(), active: field.boolean() }),
})
const includedPostSchema = UltimaBase.Schema.define({
	className: 'QueryIncludedPost',
	fields: (field) => ({
		author: field.pointer({ target: 'QueryIncludedUser' }),
		title: field.string(),
	}),
})
const includedFeedSchema = UltimaBase.Schema.define({
	className: 'QueryIncludedFeed',
	fields: (field) => ({
		posts: field.relation({ target: 'QueryIncludedPost' }),
		title: field.string(),
	}),
})

new SchemaRegistry([
	includedUserSchema,
	includedPostSchema,
	includedFeedSchema,
]).resolveSchemaTargets()

describe('QueryBuilder', () => {
	it('hydrates one internal immutable shell without rebuilding its normalized AST', () => {
		const source = new QueryBuilder(postSchema)
			.select({ id: true, title: true })
			.where((where) => where.eq('published', true))
			.limit(25)
		const hydrated = hydrateQueryFromAst<typeof postSchema, 'id' | 'title'>(
			source.ast,
		)
		const branch = hydrated.limit(10)

		expect(hydrated).toBeInstanceOf(QueryBuilder)
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

	it('builds immutable selection, ordering, limit, and offset branches', () => {
		const base = new QueryBuilder(postSchema)
		const selected = base.select({ title: true, id: true })
		const excluded = base.select({ published: false, updatedAt: false })
		const replacedSelection = selected.select({ views: true })
		const ordered = selected.descending('createdAt', 'title').ascending('title')
		const limited = ordered.limit(25)
		const offset = limited.offset(50)
		const clearedOffset = offset.offset(0)

		expect(base.ast.selection.fields).toStrictEqual([])
		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'title' },
			{ kind: 'selected-field', field: 'id' },
		])
		expect(
			excluded.ast.selection.fields.map(({ field }) => field),
		).toStrictEqual([
			'title',
			'views',
			'score',
			'status',
			'aliases',
			'metadata',
			'payload',
			'attachment',
			'id',
			'createdAt',
		])
		expect(replacedSelection.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'views' },
			{ kind: 'selected-field', field: 'id' },
		])
		expect(ordered.ast.ordering.orders).toStrictEqual([
			{ kind: 'order', field: 'createdAt', direction: 'descending' },
			{ kind: 'order', field: 'title', direction: 'ascending' },
		])
		expect(limited.ast.limit).toBe(25)
		expect(offset.ast.pagination).toStrictEqual({
			kind: 'offset-pagination',
			offset: 50,
		})
		expect(clearedOffset.ast.pagination).toBeUndefined()
		expect(offset.build()).toMatchObject({ offset: 50, limit: 25 })
		expect(base).not.toBe(selected)
		expect(base).not.toBe(excluded)
		expect(selected).not.toBe(replacedSelection)
		expect(selected).not.toBe(ordered)
		expect(ordered).not.toBe(limited)
		expect(limited).not.toBe(offset)
	})

	it('shares every unchanged immutable AST branch', () => {
		const base = new QueryBuilder(postSchema)
			.select({ title: true })
			.descending('createdAt')
		const published = base.where((where) => where.eq('published', true))
		const limited = published.limit(10)
		const noSelectionChange = base.select({})
		const noOrderingChange = base.ascending()
		const noOffsetChange = base.offset(0)

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
		const base = new QueryBuilder(includedPostSchema)
		const included = base.include('author', (query) =>
			query.select({ id: true, name: true }),
		)
		const replaced = included.include('author', (query) =>
			query.select({ name: true }),
		)

		expect(base.ast.inclusion.fields).toStrictEqual([])
		expect(included.ast.inclusion.fields).toHaveLength(1)
		expect(included.ast.inclusion.fields[0]).toMatchObject({
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
			},
		})
		expect(replaced.ast.inclusion.fields).toHaveLength(1)
		expect(
			replaced.ast.inclusion.fields[0]?.query.selection.fields,
		).toStrictEqual([
			{ kind: 'selected-field', field: 'name' },
			{ kind: 'selected-field', field: 'id' },
		])
		expect(Object.isFrozen(included.ast.inclusion)).toBe(true)
		expect(Object.isFrozen(included.ast.inclusion.fields)).toBe(true)
		expect(Object.isFrozen(included.ast.inclusion.fields[0])).toBe(true)
	})

	it('builds bounded relation inclusion branches with collection cardinality', () => {
		const included = new QueryBuilder(includedFeedSchema).include(
			'posts',
			(query) =>
				query
					.select({ title: true })
					.where((where) => where.ne('title', 'Archived'))
					.descending('createdAt')
					.limit(4)
					.offset(2),
		)

		expect(included.ast.selection.fields).toStrictEqual([])
		expect(included.ast.inclusion.fields[0]).toMatchObject({
			field: 'posts',
			kind: 'included-relation',
			query: {
				limit: 4,
				pagination: { kind: 'offset-pagination', offset: 2 },
				ordering: {
					orders: [{ direction: 'descending', field: 'createdAt' }],
				},
				selection: { fields: [{ field: 'title' }, { field: 'id' }] },
			},
		})
		expect(included.build()).toStrictEqual({
			include: {
				posts: {
					limit: 4,
					offset: 2,
					orderBy: { createdAt: 'desc' },
					select: { id: true, title: true },
					where: { title: { ne: 'Archived' } },
				},
			},
		})
	})

	it('normalizes pointer identity predicates without physical foreign-key names', () => {
		const author = includedUserSchema.pointer(
			'0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
		)
		const query = new QueryBuilder(includedPostSchema)
			.where((where) => where.eq('author', author.id))
			.where((where) => where.in('author', [author.id]))
			.where((where) => where.isNull('author'))

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
		const selected = new QueryBuilder(includedPostSchema)
			.select({ id: true })
			.include('author', (query) => query.select({ name: true }))

		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'author' },
		])
		expect(JSON.stringify(selected.ast)).toContain('"field":"author"')
		expect(JSON.stringify(selected.ast)).not.toContain('authorId')
		expect(() =>
			new QueryBuilder(includedPostSchema).include('author', (query) => {
				// JavaScript may still pass a target filter despite the source contract.
				const where: unknown = Reflect.get(query, 'where')
				if (typeof where !== 'function') {
					throw new TypeError('QueryBuilder.where must be callable')
				}
				const filtered: unknown = Reflect.apply(where, query, [
					{ active: { eq: true } },
				])
				return filtered as typeof query
			}),
		).toThrow(
			new TypeError('pointer-target input contains an unknown clause: where'),
		)
		expect(() =>
			new QueryBuilder(includedPostSchema).include(
				'author',
				// @ts-expect-error -- Runtime validation protects JavaScript callbacks.
				() => immutableScopeFixture,
			),
		).toThrow(
			new TypeError(
				'query inclusion callback must return a QueryBuilder for the relationship target',
			),
		)
		expect(() =>
			// @ts-expect-error -- Only relationship fields can be included.
			new QueryBuilder(includedPostSchema).include('title', (query) => query),
		).toThrow(
			new TypeError(
				'query inclusion field must reference a pointer or relation field',
			),
		)
	})

	it('creates every primitive filter through an implicit AND chain', () => {
		const statusValues: ('draft' | 'published')[] = ['draft', 'published']
		const regexFlags: ('case-insensitive' | 'multiline')[] = [
			'case-insensitive',
			'case-insensitive',
			'multiline',
		]
		const query = new QueryBuilder(postSchema)
			.where((where) => where.eq('published', true))
			.where((where) => where.ne('status', 'draft'))
			.where((where) => where.gt('views', 10))
			.where((where) => where.gte('views', 11))
			.where((where) => where.lt('views', 100))
			.where((where) => where.lte('views', 99))
			.where((where) => where.between('views', 20, 80))
			.where((where) => where.notBetween('views', 40, 60))
			.where((where) => where.in('status', statusValues))
			.where((where) => where.notIn('status', ['draft']))
			.where((where) => where.contains('title', 'Base'))
			.where((where) => where.startsWith('title', 'Ultima'))
			.where((where) => where.endsWith('title', 'Base'))
			.where((where) =>
				where.matches('title', { source: '^Ultima', flags: regexFlags }),
			)
			.where((where) => where.isNotNull('metadata'))
			.where((where) => where.isNull('aliases'))
			.where((where) => where.eq('score', null))

		statusValues.push('draft')
		regexFlags.push('multiline')

		expect(query.ast.where?.expression).toMatchObject({
			kind: 'and',
		})
		if (query.ast.where?.expression.kind === 'and') {
			expect(query.ast.where.expression.expressions).toHaveLength(17)
			expect(query.ast.where.expression.expressions[6]).toStrictEqual({
				kind: 'between',
				field: 'views',
				lower: 20,
				upper: 80,
			})
			expect(query.ast.where.expression.expressions[7]).toStrictEqual({
				kind: 'not-between',
				field: 'views',
				lower: 40,
				upper: 60,
			})
			expect(query.ast.where.expression.expressions[8]).toStrictEqual({
				kind: 'in',
				field: 'status',
				values: ['draft', 'published'],
			})
			expect(query.ast.where.expression.expressions[13]).toStrictEqual({
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

	it('builds immutable structural filters for JSON and typed object paths', () => {
		const keys = ['theme', 'locale']
		const partial = { label: 'typed' }
		const query = new QueryBuilder(postSchema)
			.where((where) => where.contains('metadata', partial))
			.where((where) => where.containedBy('metadata', { label: 'typed' }))
			.where((where) => where.hasKey('metadata', 'label'))
			.where((where) => where.hasAnyKeys('payload', keys))
			.where((where) => where.hasAllKeys('payload', ['theme']))
			.where((where) => where.eq(fieldPath('metadata', ['label']), 'typed'))
			.where((where) =>
				where.contains(fieldPath('payload', ['nested']), { enabled: true }),
			)
			.where((where) =>
				where.jsonPathExists('payload', {
					source: '$.items[*] ? (@.price > $minimum)',
					variables: { minimum: 10 },
				}),
			)
			.where((where) =>
				where.jsonPathMatches('metadata', {
					source: 'exists($.label ? (@ == $expected))',
					variables: { expected: 'typed' },
				}),
			)

		keys.push('mutated')
		partial.label = 'mutated'

		if (query.ast.where?.expression.kind !== 'and') {
			throw new TypeError('Structured query fixture requires an AND expression')
		}

		expect(query.ast.where.expression.expressions).toStrictEqual([
			{ kind: 'contains', field: 'metadata', value: { label: 'typed' } },
			{ kind: 'contained-by', field: 'metadata', value: { label: 'typed' } },
			{ kind: 'has-key', field: 'metadata', value: 'label' },
			{
				kind: 'has-any-keys',
				field: 'payload',
				keys: ['theme', 'locale'],
			},
			{ kind: 'has-all-keys', field: 'payload', keys: ['theme'] },
			{
				kind: 'equal',
				field: 'metadata',
				path: ['label'],
				value: 'typed',
			},
			{
				kind: 'contains',
				field: 'payload',
				path: ['nested'],
				value: { enabled: true },
			},
			{
				field: 'payload',
				kind: 'json-path-exists',
				source: '$.items[*] ? (@.price > $minimum)',
				variables: { minimum: 10 },
			},
			{
				field: 'metadata',
				kind: 'json-path-matches',
				source: 'exists($.label ? (@ == $expected))',
				variables: { expected: 'typed' },
			},
		])
		expect(Object.isFrozen(query.ast.where.expression.expressions[0])).toBe(
			true,
		)
		const keyExpression = query.ast.where.expression.expressions[3]

		if (keyExpression?.kind !== 'has-any-keys') {
			throw new TypeError('Structured query fixture requires a key expression')
		}

		expect(Object.isFrozen(keyExpression.keys)).toBe(true)
	})

	it('adds the framework identifier without mutating existing filters', () => {
		const objectId = '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a'
		const expected = new QueryBuilder(postSchema).where((where) =>
			where.eq('id', objectId),
		)
		const base = new QueryBuilder(postSchema).where((where) =>
			where.eq('published', true),
		)
		const identified = base.where({ id: { eq: objectId } })

		expect(
			new QueryBuilder(postSchema).where({ id: { eq: objectId } }).ast.where,
		).toStrictEqual(expected.ast.where)

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

	it('combines object filters without copying other clauses', () => {
		const base = new QueryBuilder(postSchema).limit(25).descending('createdAt')
		const published = new QueryBuilder(postSchema).where({
			published: { eq: true },
		})
		const popular = new QueryBuilder(postSchema).where({
			views: { gt: 100 },
		})
		const andQuery = base.where({
			AND: [{ published: { eq: true } }, { views: { gt: 100 } }],
		})
		const orQuery = base.where({
			OR: [{ published: { eq: true } }, { views: { gt: 100 } }],
		})
		const notQuery = published.where({ NOT: { views: { gt: 100 } } })
		const adopted = base.where({ views: { gt: 100 } })

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
		expect(adopted.ast.where?.expression).toStrictEqual(
			popular.ast.where?.expression,
		)
		expect(adopted.ast.limit).toBe(25)
		expect(adopted.ast.ordering).toBe(base.ast.ordering)
	})

	it('composes reusable scopes across immutable query branches', () => {
		const published: QueryScope<typeof postSchema> = (query) =>
			query.where((where) => where.eq('published', true))
		const popular: QueryScope<typeof postSchema> = (query) =>
			query.where((where) => where.gt('views', 100))
		const discoverable: QueryScope<typeof postSchema> = (query) =>
			query.use(published).use(popular).descending('createdAt')
		const base = new QueryBuilder(postSchema).select({ id: true, title: true })
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
		const commentSchema = UltimaBase.Schema.define({
			className: 'Comment',
			fields: (field) => ({ body: field.string() }),
		})

		expect(() =>
			new QueryBuilder(postSchema).use(
				// @ts-expect-error -- Runtime validation rejects non-QueryBuilder scope results.
				() => immutableScopeFixture,
			),
		).toThrow(new TypeError('query scope must return a QueryBuilder instance'))
		expect(() =>
			new QueryBuilder(postSchema).use(
				// @ts-expect-error -- Runtime validation repeats exact-schema enforcement.
				() => new QueryBuilder(commentSchema),
			),
		).toThrow(
			new TypeError('query scope must return the same schema definition'),
		)
	})

	it('rejects incompatible schemas, fields, operators, and values', () => {
		// The same shape but a different definition proves that identity is enforced.
		const otherPostSchema = UltimaBase.Schema.define({
			className: 'Post',
			fields: () => postFields,
		})

		expect(() =>
			new QueryBuilder(postSchema)
				.where((where) => where.eq('published', true))
				.where(new WhereBuilder(otherPostSchema).eq('title', 'Post')),
		).toThrow(new TypeError('WhereBuilder must use the same schema definition'))
		expect(() => {
			// @ts-expect-error -- Source typing rejects unknown filter fields.
			new QueryBuilder(postSchema).where((where) => where.eq('missing', true))
		}).toThrow(new TypeError('where.missing must reference a schema field'))
		expect(() => {
			new QueryBuilder(postSchema).where((where) =>
				// @ts-expect-error -- Ordered comparisons reject list fields.
				where.gt('aliases', ['alias']),
			)
		}).toThrow(
			new TypeError('query operator greater-than does not support list fields'),
		)
		expect(() => {
			// @ts-expect-error -- Ordered comparisons reject boolean fields.
			new QueryBuilder(postSchema).where((where) => where.gt('published', true))
		}).toThrow(
			new TypeError(
				'query operator greater-than does not support boolean fields',
			),
		)
		expect(() => {
			new QueryBuilder(postSchema).where((where) => where.gt('score', null))
		}).toThrow(new TypeError('query filter value must not be null'))
		expect(() => {
			new QueryBuilder(postSchema).where((where) =>
				where.between('score', null, 10),
			)
		}).toThrow(new TypeError('query range lower bound must not be null'))
		expect(() => {
			new QueryBuilder(postSchema).where((where) =>
				// @ts-expect-error -- String containment rejects integer fields.
				where.contains('views', '10'),
			)
		}).toThrow(
			new TypeError('query operator contains does not support int fields'),
		)
		expect(() => {
			new QueryBuilder(postSchema).where((where) =>
				// @ts-expect-error -- Boolean filters reject string values.
				where.eq('published', 'true'),
			)
		}).toThrow(TypeError)
		expect(() => {
			// @ts-expect-error -- Id filters require strings.
			new QueryBuilder(postSchema).where({ id: { eq: 42 } })
		}).toThrow(new TypeError('query filter value must be a string'))
	})

	it('snapshots mutable scalar operands without retaining execution terminals', () => {
		const attachment = new Uint8Array([1, 2, 3])
		const query = new QueryBuilder(postSchema).where((where) =>
			where.eq('attachment', attachment),
		)

		attachment[0] = 9

		expect(query.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'attachment',
			value: new Uint8Array([1, 2, 3]),
		})
		expect(query.schema).toBe(postSchema)
		expect(query).not.toHaveProperty('bind')
		expect(query).not.toHaveProperty('findMany')
		expect(query).toHaveProperty('build')
		expect(query).not.toHaveProperty('save')
	})
})

// This frozen fixture models an arbitrary object returned by untyped JavaScript.
const immutableScopeFixture = Object.freeze({ kind: 'not-a-query' })
