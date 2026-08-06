import {
	booleanField,
	Schema,
	enumField,
	intField,
	jsonField,
	objectField,
	pointerField,
	stringField,
	type Pointer,
} from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import type * as publicQuery from '../index.js'

import {
	fieldPath,
	Query,
	type QueryFilterFieldName,
	type QueryFilterNode,
	type QuerySelection,
} from '../index.js'
import { hydrateQueryFromAst } from './query.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField(),
		views: intField(),
		score: intField(),
		status: enumField({ values: ['draft', 'published'] }),
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
		payload: jsonField(),
	},
})

const includedUserSchema = Schema.define({
	className: 'TypedQueryUser',
	fields: { name: stringField(), active: booleanField() },
})
const includedPostSchema = Schema.define({
	className: 'TypedQueryPost',
	fields: {
		author: pointerField({
			target: () => includedUserSchema,
			validation: { required: true },
		}),
		reviewer: pointerField({ target: () => includedUserSchema }),
		title: stringField(),
	},
})

test('preserves schema, AST, and chain result types', () => {
	const query = new Query(postSchema)
		.where((where) => where.eq('published', true))
		.where({ id: { eq: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a' } })
		.where((where) => where.gt('views', 10))
		.select({ title: true, id: true })
		.descending('createdAt')
		.limit(25)
		.after('opaque.cursor')

	expect(query.schema.className).toBe('Post')
	expectTypeOf(query).toEqualTypeOf<Query<typeof postSchema, 'title' | 'id'>>()
	expectTypeOf(query.ast.schema.definition).toEqualTypeOf<typeof postSchema>()
	expectTypeOf(query.ast.where?.expression).toEqualTypeOf<
		QueryFilterNode<typeof postSchema> | undefined
	>()
	expectTypeOf<
		QueryFilterFieldName<typeof postSchema, 'greater-than'>
	>().toEqualTypeOf<'title' | 'views' | 'score' | 'createdAt' | 'updatedAt'>()
	expectTypeOf<'findMany'>().toExtend<keyof typeof query>()
	expectTypeOf<'save'>().not.toExtend<keyof typeof query>()
	expectTypeOf<'bind'>().not.toExtend<keyof typeof query>()

	// @ts-expect-error -- Public AST roots remain immutable.
	query.ast.limit = 50
})

test('hydrates exact selections internally without widening the public API', () => {
	const source = new Query(postSchema).select({ title: true, id: true })
	const unselected = new Query(postSchema)
	const hydrated = hydrateQueryFromAst<typeof postSchema, 'title' | 'id'>(
		source.ast,
	)
	const requireSelected = (
		query: Query<typeof postSchema, 'title' | 'id'>,
	): Query<typeof postSchema, 'title' | 'id'> => query

	expectTypeOf(hydrated).toEqualTypeOf<
		Query<typeof postSchema, 'title' | 'id'>
	>()
	requireSelected(hydrated)

	// @ts-expect-error -- Select-all cannot satisfy a concrete projection contract.
	requireSelected(unselected)
	// @ts-expect-error -- A concrete projection cannot masquerade as select-all either.
	const selectAll: Query<typeof postSchema> = hydrated

	void selectAll
	expectTypeOf<'hydrateQueryFromAst'>().not.toExtend<keyof typeof publicQuery>()
})

test('infers literal inclusion and exclusion projections exactly', () => {
	const included = new Query(postSchema).select({
		title: true,
		published: false,
	})
	const excluded = new Query(postSchema).select({ payload: false })
	const empty = new Query(postSchema).select({})
	const reusableSelection = {
		id: true,
		title: true,
	} satisfies QuerySelection<typeof postSchema>
	const reusable = new Query(postSchema).select(reusableSelection)
	type IncludedResult = NonNullable<
		Awaited<ReturnType<typeof included.findOne>>
	>
	type ExcludedResult = NonNullable<
		Awaited<ReturnType<typeof excluded.findOne>>
	>
	type EmptyResult = NonNullable<Awaited<ReturnType<typeof empty.findOne>>>

	expect(excluded.ast.kind).toBe('query')
	expect(empty.ast.kind).toBe('query')
	expectTypeOf(included).toEqualTypeOf<Query<typeof postSchema, 'title'>>()
	expectTypeOf(reusable).toEqualTypeOf<
		Query<typeof postSchema, 'id' | 'title'>
	>()
	expectTypeOf<IncludedResult>().toHaveProperty('title')
	expectTypeOf<IncludedResult>().not.toHaveProperty('published')
	expectTypeOf<ExcludedResult>().not.toHaveProperty('payload')
	expectTypeOf<ExcludedResult>().toHaveProperty('title')
	expectTypeOf<EmptyResult>().toEqualTypeOf<
		NonNullable<
			Awaited<ReturnType<ReturnType<typeof postSchema.query>['findOne']>>
		>
	>()

	const dynamicFlag = Boolean(Date.now())
	// @ts-expect-error -- Dynamic flags cannot promise one exact static result shape.
	new Query(postSchema).select({ title: dynamicFlag })
})

test('correlates every filter field with its exact operand type', () => {
	const query = new Query(postSchema)

	query.where((where) => where.eq('published', true))
	query.where((where) => where.eq('score', null))
	query.where((where) => where.ne('status', 'draft'))
	query.where((where) => where.gt('views', 10))
	query.where((where) => where.gte('views', 10))
	query.where((where) => where.lt('views', 100))
	query.where((where) => where.lte('views', 100))
	query.where((where) => where.between('views', 10, 100))
	query.where((where) => where.notBetween('views', 10, 100))
	query.where((where) => where.in('status', ['draft', 'published']))
	query.where((where) => where.notIn('status', ['draft']))
	query.where((where) => where.contains('title', 'Base'))
	query.where((where) => where.contains('metadata', { label: 'typed' }))
	query.where((where) => where.containedBy('metadata', { label: 'typed' }))
	query.where((where) => where.hasKey('metadata', 'label'))
	query.where((where) => where.hasAnyKeys('payload', ['theme', 'locale']))
	query.where((where) => where.hasAllKeys('payload', ['theme', 'locale']))
	query.where((where) =>
		where.jsonPathExists('payload', {
			source: '$.items[*] ? (@.price > $minimum)',
			variables: { minimum: 10 },
		}),
	)
	query.where((where) =>
		where.jsonPathMatches('metadata', {
			source: 'exists($.label ? (@ == $expected))',
			variables: { expected: 'typed' },
		}),
	)
	query.where((where) =>
		where.jsonPathExists(fieldPath('payload', ['nested']), {
			source: '$.items[*]',
		}),
	)
	query.where((where) => where.eq(fieldPath('metadata', ['label']), 'typed'))
	query.where((where) =>
		where.contains(fieldPath('metadata', ['label']), 'type'),
	)
	query.where((where) =>
		where.eq(fieldPath('payload', ['nested', 'count']), 42),
	)
	query.where((where) =>
		where.contains(fieldPath('payload', ['nested']), { enabled: true }),
	)
	query.where((where) => where.startsWith('title', 'Ultima'))
	query.where((where) => where.endsWith('title', 'Base'))
	query.where((where) =>
		where.matches('title', { source: '^Ultima', flags: ['case-insensitive'] }),
	)
	query.where((where) => where.isNotNull('metadata'))
	query.where((where) => where.isNull('aliases'))

	// @ts-expect-error -- Boolean operands remain booleans.
	query.where((where) => where.eq('published', 'true'))
	// @ts-expect-error -- Enum operands remain their exact literal union.
	query.where((where) => where.eq('status', 'archived'))
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	query.where((where) => where.gt('published', true))
	// @ts-expect-error -- Ordered comparisons reject nullable null operands.
	query.where((where) => where.gt('score', null))
	// @ts-expect-error -- Range bounds reject nullable null operands.
	query.where((where) => where.between('score', null, 100))
	// @ts-expect-error -- Range filters reject unordered fields.
	query.where((where) => where.notBetween('published', false, true))
	// @ts-expect-error -- Membership values stay correlated with the enum.
	query.where((where) => where.in('status', ['archived']))
	// @ts-expect-error -- String operators reject numeric fields.
	query.where((where) => where.contains('views', '10'))
	// @ts-expect-error -- Typed object containment rejects unknown child fields.
	query.where((where) => where.contains('metadata', { unknown: true }))
	// @ts-expect-error -- Typed object paths reject unknown child fields.
	query.where((where) => where.eq(fieldPath('metadata', ['unknown']), 'typed'))
	// @ts-expect-error -- Typed object path operands preserve child value types.
	query.where((where) => where.eq(fieldPath('metadata', ['label']), 42))
	// @ts-expect-error -- Key operators reject ordinary scalar fields.
	query.where((where) => where.hasKey('title', 'length'))
	// @ts-expect-error -- Typed object key operators suggest only declared fields.
	query.where((where) => where.hasKey('metadata', 'unknown'))
	// @ts-expect-error -- JSONPath targets must be JSON or object structures.
	query.where((where) => where.jsonPathExists('title', { source: '$' }))
	query.where((where) =>
		where.jsonPathExists('payload', {
			source: '$.items[*]',
			// @ts-expect-error -- JSONPath variables remain portable JSON values.
			variables: { minimum: 10n },
		}),
	)
	// @ts-expect-error -- Regex filters reject non-string fields.
	query.where((where) => where.matches('views', { source: '10', flags: [] }))
	// @ts-expect-error -- Equality does not apply to list fields.
	query.where((where) => where.eq('aliases', ['alias']))
	// @ts-expect-error -- Range filters do not apply to list fields.
	query.where((where) => where.between('aliases', ['a'], ['z']))
})

test('infers pointer predicates, target queries, and included projections', () => {
	const author = includedUserSchema.pointer(
		'0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
	)
	const pointerQuery = author.query().select({ id: true, name: true })
	const included = new Query(includedPostSchema)
		.select({ id: true, title: true })
		.where((where) => where.eq('author', author))
		.where((where) => where.in('author', [author]))
		.where((where) => where.isNotNull('author'))
		.include('author', (query) =>
			query
				.select({ id: true, name: true })
				.where((where) => where.eq('active', true)),
		)
		.include('reviewer', (query) => query.select({ name: true }))
	type IncludedResult = NonNullable<
		Awaited<ReturnType<typeof included.findOne>>
	>
	type PlainResult = NonNullable<
		Awaited<ReturnType<ReturnType<typeof includedPostSchema.query>['findOne']>>
	>

	expect(included.ast.kind).toBe('query')
	expectTypeOf(pointerQuery).toEqualTypeOf<
		Query<typeof includedUserSchema, 'id' | 'name'>
	>()
	expectTypeOf<IncludedResult>().toHaveProperty('id')
	expectTypeOf<IncludedResult>().toHaveProperty('title')
	expectTypeOf<IncludedResult>().toHaveProperty('author')
	expectTypeOf<IncludedResult>().toHaveProperty('reviewer')
	expectTypeOf<NonNullable<IncludedResult['author']>['name']>().toEqualTypeOf<
		string | null
	>()
	expectTypeOf<null>().toExtend<IncludedResult['author']>()
	expectTypeOf<NonNullable<IncludedResult['reviewer']>['name']>().toEqualTypeOf<
		string | null
	>()
	expectTypeOf<null>().toExtend<IncludedResult['reviewer']>()
	expectTypeOf<undefined>().not.toExtend<IncludedResult['reviewer']>()
	expectTypeOf<PlainResult['author']>().toEqualTypeOf<
		Pointer<typeof includedUserSchema>
	>()

	new Query(includedPostSchema).where((where) =>
		// @ts-expect-error -- Pointer equality preserves exact target identity.
		where.eq('author', postSchema.pointer('post-1')),
	)
	// @ts-expect-error -- Pointers do not support ordered comparisons.
	new Query(includedPostSchema).where((where) => where.gt('author', author))
	// @ts-expect-error -- Only pointer fields are includable.
	new Query(includedPostSchema).include('title', (query) => query)
	new Query(includedPostSchema).include('author', (query) => {
		// @ts-expect-error -- The callback Query exposes only target fields.
		query.select({ title: true })
		return query
	})
})

test('restricts fields, pagination values, and logical schemas', () => {
	const query = new Query(postSchema)
	query
		.select({ title: true, createdAt: true })
		.ascending('title')
		.descending('views')
	query.limit(25)
	query.skip(50)
	query.after('opaque.cursor')
	query.after()
	query.where({ AND: [{ published: { eq: true } }] })
	query.where({ OR: [{ published: { eq: false } }] })
	query.where({ NOT: { title: { isNotNull: true } } })

	// @ts-expect-error -- Selection is restricted to schema fields.
	query.select({ missing: true })
	// @ts-expect-error -- Ordering is restricted to schema fields.
	query.ascending('missing')
	// @ts-expect-error -- Limit requires a number.
	query.limit('25')
	// @ts-expect-error -- Offset requires a number.
	query.skip('50')
	// @ts-expect-error -- Cursors require opaque strings at the input boundary.
	query.after(42)
	// @ts-expect-error -- Framework identifiers retain their schema-derived type.
	query.where({ id: { eq: 42 } })
	// @ts-expect-error -- Logical combinations retain the exact schema type.
	query.where({ AND: [{ body: { eq: 'Comment' } }] })

	expect(query.ast.kind).toBe('query')
})
