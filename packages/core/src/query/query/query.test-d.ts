import {
	booleanField,
	Schema,
	enumField,
	intField,
	objectField,
	pointerField,
	stringField,
	type Pointer,
} from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import type * as publicQuery from '../index.js'

import {
	Query,
	type QueryFilterFieldName,
	type QueryFilterNode,
} from '../index.js'
import { hydrateQueryFromAst } from './query.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField(),
		views: intField(),
		score: intField({ validation: { nullable: true } }),
		status: enumField({ values: ['draft', 'published'] }),
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
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
		reviewer: pointerField({
			target: () => includedUserSchema,
			validation: { nullable: true },
		}),
		title: stringField(),
	},
})

test('preserves schema, AST, and chain result types', () => {
	const query = new Query(postSchema)
		.equalTo('published', true)
		.byId('0194f292-0dd9-7c2d-a0a3-a2f755a3d90a')
		.greaterThan('views', 10)
		.select('title', 'id')
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
	expectTypeOf<'find'>().toExtend<keyof typeof query>()
	expectTypeOf<'save'>().not.toExtend<keyof typeof query>()
	expectTypeOf<'bind'>().not.toExtend<keyof typeof query>()

	// @ts-expect-error -- Public AST roots remain immutable.
	query.ast.limit = 50
})

test('hydrates exact selections internally without widening the public API', () => {
	const source = new Query(postSchema).select('title', 'id')
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

test('correlates every filter field with its exact operand type', () => {
	const query = new Query(postSchema)

	query.equalTo('published', true)
	query.equalTo('score', null)
	query.notEqualTo('status', 'draft')
	query.greaterThan('views', 10)
	query.greaterThanOrEqualTo('views', 10)
	query.lessThan('views', 100)
	query.lessThanOrEqualTo('views', 100)
	query.containedIn('status', ['draft', 'published'])
	query.notContainedIn('status', ['draft'])
	query.contains('title', 'Base')
	query.startsWith('title', 'Ultima')
	query.endsWith('title', 'Base')
	query.matches('title', { source: '^Ultima', flags: ['case-insensitive'] })
	query.exists('metadata')
	query.doesNotExist('aliases')

	// @ts-expect-error -- Boolean operands remain booleans.
	query.equalTo('published', 'true')
	// @ts-expect-error -- Enum operands remain their exact literal union.
	query.equalTo('status', 'archived')
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	query.greaterThan('published', true)
	// @ts-expect-error -- Ordered comparisons reject nullable null operands.
	query.greaterThan('score', null)
	// @ts-expect-error -- Membership values stay correlated with the enum.
	query.containedIn('status', ['archived'])
	// @ts-expect-error -- String operators reject numeric fields.
	query.contains('views', '10')
	// @ts-expect-error -- Regex filters reject non-string fields.
	query.matches('views', { source: '10', flags: [] })
	// @ts-expect-error -- Equality does not apply to list fields.
	query.equalTo('aliases', ['alias'])
})

test('infers pointer predicates, target queries, and included projections', () => {
	const author = includedUserSchema.pointer(
		'0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
	)
	const pointerQuery = author.query().select('id', 'name')
	const included = new Query(includedPostSchema)
		.select('id', 'title')
		.equalTo('author', author)
		.containedIn('author', [author])
		.exists('author')
		.include('author', (query) =>
			query.select('id', 'name').equalTo('active', true),
		)
		.include('reviewer', (query) => query.select('name'))
	type IncludedResult = NonNullable<Awaited<ReturnType<typeof included.first>>>
	type PlainResult = NonNullable<
		Awaited<ReturnType<ReturnType<typeof includedPostSchema.query>['first']>>
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
		string | undefined
	>()
	expectTypeOf<null>().toExtend<IncludedResult['author']>()
	expectTypeOf<NonNullable<IncludedResult['reviewer']>['name']>().toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf<null>().toExtend<IncludedResult['reviewer']>()
	expectTypeOf<undefined>().toExtend<IncludedResult['reviewer']>()
	expectTypeOf<PlainResult['author']>().toEqualTypeOf<
		Pointer<typeof includedUserSchema>
	>()

	// @ts-expect-error -- Pointer equality preserves exact target identity.
	new Query(includedPostSchema).equalTo('author', postSchema.pointer('post-1'))
	// @ts-expect-error -- Pointers do not support ordered comparisons.
	new Query(includedPostSchema).greaterThan('author', author)
	// @ts-expect-error -- Only pointer fields are includable.
	new Query(includedPostSchema).include('title', (query) => query)
	new Query(includedPostSchema).include('author', (query) => {
		// @ts-expect-error -- The callback Query exposes only target fields.
		query.select('title')
		return query
	})
})

test('restricts fields, pagination values, and logical schemas', () => {
	const query = new Query(postSchema)
	const commentSchema = Schema.define({
		className: 'Comment',
		fields: { body: stringField() },
	})

	query.select('title', 'createdAt').ascending('title').descending('views')
	query.limit(25)
	query.skip(50)
	query.after('opaque.cursor')
	query.after()
	query.and(new Query(postSchema).equalTo('published', true))
	query.or(new Query(postSchema).equalTo('published', false))
	query.not(new Query(postSchema).exists('title'))

	// @ts-expect-error -- Selection is restricted to schema fields.
	query.select('missing')
	// @ts-expect-error -- Ordering is restricted to schema fields.
	query.ascending('missing')
	// @ts-expect-error -- Limit requires a number.
	query.limit('25')
	// @ts-expect-error -- Offset requires a number.
	query.skip('50')
	// @ts-expect-error -- Cursors require opaque strings at the input boundary.
	query.after(42)
	// @ts-expect-error -- Framework identifiers retain their schema-derived type.
	query.byId(42)
	// @ts-expect-error -- Logical combinations retain the exact schema type.
	query.and(new Query(commentSchema).equalTo('body', 'Comment'))

	expect(query.ast.kind).toBe('query')
})
