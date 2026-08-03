import {
	intField,
	stringField,
	Schema,
	type InferQueryResult,
	type UltimaBase,
} from '../../src/index.js'
import { expectTypeOf, test } from 'vitest'

const articleSchema = Schema.define({
	className: 'TypedTerminalArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

declare const ultimabase: UltimaBase<
	readonly [typeof articleSchema],
	readonly []
>

test('preserves Query schema selection across every singular terminal', () => {
	const query = articleSchema.query().select('id', 'title')

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
	expectTypeOf(query.createOne({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.updateOne({ increment: { views: 1 } })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.deleteOne()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.find({ ultimabase })).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(
		query.create({ title: 'Created' }, { ultimabase }),
	).toEqualTypeOf<Promise<InferQueryResult<typeof articleSchema>>>()
	expectTypeOf(
		query.createMany([{ title: 'Created' }], {
			atomic: false,
			ultimabase,
		}),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof articleSchema>[]>>()
	expectTypeOf(
		query.updateMany({ increment: { views: 1 } }, { ultimabase }),
	).toEqualTypeOf<Promise<number>>()
	expectTypeOf(
		articleSchema
			.query()
			.equalTo('title', 'Unique')
			.upsert(
				{
					create: { title: 'Unique' },
					update: { increment: { views: 1 } },
				},
				{ ultimabase },
			),
	).toEqualTypeOf<Promise<InferQueryResult<typeof articleSchema>>>()
	expectTypeOf(query.deleteMany({ ultimabase })).toEqualTypeOf<
		Promise<number>
	>()

	// @ts-expect-error -- Read terminals accept only their final execution options.
	void query.find({ atomic: false })
	// @ts-expect-error -- Mutation execution options follow the mutation input.
	void query.create({ ultimabase }, { title: 'Created' })
	// @ts-expect-error -- Terminal ownership never becomes a Query builder option.
	articleSchema.query({ ultimabase })
})
