import {
	booleanField,
	Schema,
	intField,
	stringField,
} from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { QueryOperationExecutor } from '../operations/executor.js'
import type { InferQueryResult } from './result.js'
import { Query } from './query.js'
import type { QueryScope } from './scope.js'

const articleSchema = Schema.define({
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
	const reusable = new Query(articleSchema).equalTo('published', true)
	const bound = reusable.bind(executor).select('id', 'title').limit(10)
	const identified = bound.byId('0194f292-0dd9-7c2d-a0a3-a2f755a3d90a')
	const projection = null as unknown as InferQueryResult<
		typeof articleSchema,
		'id' | 'title'
	>

	expectTypeOf(bound.schema).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf(bound.engine).toEqualTypeOf<typeof executor>()
	expectTypeOf(identified).toEqualTypeOf<typeof bound>()
	expectTypeOf(projection.id).toBeString()
	expectTypeOf(projection.title).toBeString()
	expectTypeOf<InferQueryResult<typeof articleSchema>>().toHaveProperty('views')

	// @ts-expect-error -- Selection remains restricted to the bound schema.
	bound.select('missing')
	// @ts-expect-error -- Bound filters retain field-specific value types.
	bound.equalTo('published', 'true')
	// @ts-expect-error -- Bound identifiers retain their schema-derived type.
	bound.byId(42)
	// @ts-expect-error -- Projected results cannot expose omitted fields.
	void projection.views
})

test('retains schema, selection, and engine types through scopes', () => {
	const published: QueryScope<typeof articleSchema> = (query) =>
		query.equalTo('published', true)
	const scoped = new Query(articleSchema)
		.bind(executor)
		.select('id', 'title')
		.use(published)

	expectTypeOf(scoped.schema).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf(scoped.engine).toEqualTypeOf<typeof executor>()
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
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.createMany([{ title: 'Created' }])).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema>[]>
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
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof articleSchema>[]>>()
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
	// @ts-expect-error -- Update groups reject unknown top-level operators.
	void query.updateOne({ increment: { views: 1 }, unknown: true })
	void query.updateOne({
		set: {
			title: 'Updated',
			// @ts-expect-error -- Set retains the exact mutable schema fields.
			missing: 'value',
		},
	})
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

	// @ts-expect-error -- Binding requires a real neutral operation executor.
	new Query(articleSchema).bind({ kind: 'opaque' })
})
