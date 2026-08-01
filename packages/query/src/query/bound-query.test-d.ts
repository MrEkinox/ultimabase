import {
	booleanField,
	defineSchema,
	intField,
	stringField,
	type InferObject,
} from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import type { QueryOperationExecutor } from '../operations/executor.js'
import type { InferQueryResult } from './result.js'
import { Query } from './query.js'
import type { QueryScope } from './scope.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		slug: stringField({ indexed: 'unique' }),
		published: booleanField(),
		views: intField(),
	},
})

declare const executor: QueryOperationExecutor<typeof articleSchema>

test('binds exact schema and selection types through an engine', () => {
	// The opaque fixture models the future RequestEngine without pre-implementing it.
	const engine = { kind: 'fake-request-engine' } as const
	const reusable = new Query(articleSchema).equalTo('published', true)
	const bound = reusable.bind(engine).select('id', 'title').limit(10)
	const projection: InferQueryResult<typeof articleSchema, 'id' | 'title'> = {
		id: 'article-id',
		title: 'Title',
	}

	expectTypeOf(bound.schema).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf(bound.engine).toEqualTypeOf<typeof engine>()
	expectTypeOf(projection.id).toBeString()
	expectTypeOf(projection.title).toBeString()
	expectTypeOf<InferQueryResult<typeof articleSchema>>().toHaveProperty('views')

	// @ts-expect-error -- Selection remains restricted to the bound schema.
	bound.select('missing')
	// @ts-expect-error -- Bound filters retain field-specific value types.
	bound.equalTo('published', 'true')
	const invalidProjection: InferQueryResult<
		typeof articleSchema,
		'id' | 'title'
	> = {
		id: 'article-id',
		title: 'Title',
		// @ts-expect-error -- Future projected results cannot expose omitted fields.
		views: 1,
	}

	expectTypeOf(invalidProjection).toBeObject()
})

test('retains schema, selection, and engine types through scopes', () => {
	const engine = { kind: 'fake-request-engine' } as const
	const published: QueryScope<typeof articleSchema> = (query) =>
		query.equalTo('published', true)
	const scoped = new Query(articleSchema)
		.bind(engine)
		.select('id', 'title')
		.use(published)

	expectTypeOf(scoped.schema).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf(scoped.engine).toEqualTypeOf<typeof engine>()
	expectTypeOf(scoped.unbound).toEqualTypeOf<
		Query<typeof articleSchema, 'id' | 'title'>
	>()
})

test('types every executable terminal from schema selection and singularity', () => {
	const query = new Query(articleSchema).bind(executor).select('id', 'title')
	const filtered = query.exists('title')

	expectTypeOf(query.find()).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(query.first()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.get('article-1')).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(query.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(filtered).toEqualTypeOf<typeof query>()
	expectTypeOf(query.createOne({ title: 'Created' })).toEqualTypeOf<
		Promise<InferObject<typeof articleSchema>>
	>()
	expectTypeOf(query.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferObject<typeof articleSchema>>
	>()
	expectTypeOf(query.createMany([{ title: 'Created' }])).toEqualTypeOf<
		Promise<readonly InferObject<typeof articleSchema>[]>
	>()
	expectTypeOf(query.updateOne({ increment: { views: 1 } })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.updateMany({ increment: { views: 1 } })).toEqualTypeOf<
		Promise<number>
	>()
	const unique = new Query(articleSchema)
		.equalTo('slug', 'created')
		.select('id', 'title')
		.bind(executor)
	const upsertInput = {
		create: { title: 'Created' },
		update: { increment: { views: 1 } },
	} as const

	expectTypeOf(unique.upsertOne(upsertInput)).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'>>
	>()
	expectTypeOf(unique.upsert(upsertInput)).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'>>
	>()
	expectTypeOf(
		query.upsertMany([
			{
				query: new Query(articleSchema).equalTo('slug', 'created'),
				...upsertInput,
			},
		]),
	).toEqualTypeOf<Promise<readonly InferObject<typeof articleSchema>[]>>()
	expectTypeOf(query.deleteOne()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.deleteMany()).toEqualTypeOf<Promise<number>>()

	// @ts-expect-error -- Object identifiers preserve their schema-derived type.
	void query.get(1)
	// @ts-expect-error -- Required create fields cannot be omitted.
	void query.create({})
	// @ts-expect-error -- Update input retains field-specific numeric values.
	void query.updateOne({ increment: { views: 'one' } })
	// @ts-expect-error -- Bulk create retains required schema fields.
	void query.createMany([{}])
	void query.upsertMany([
		{
			query: new Query(articleSchema).equalTo('slug', 'created'),
			// @ts-expect-error -- Bulk upsert create input retains required schema fields.
			create: {},
			update: { increment: { views: 1 } },
		},
	])

	const opaque = new Query(articleSchema).bind({ kind: 'opaque' })

	// @ts-expect-error -- An opaque binding does not satisfy the execution contract.
	void opaque.find()
})
