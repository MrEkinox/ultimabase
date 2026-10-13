import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	type CreateInput,
	type JsonDocument,
	type QueryResult,
	type SchemaCreateData,
	type SchemaItem,
	type SchemaOutput,
	type SchemaTypeInfoFor,
	type SchemaUpdateData,
	pointerField,
	relationField,
} from '../../index.js'

const SourceAuthor = UltimaBase.Schema.define({
	className: 'SourceAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const SourceArticle = UltimaBase.Schema.define({
	className: 'SourceArticle',
	fields: (field) => ({
		author: pointerField({ required: true, target: () => SourceAuthor }),
		reviewers: relationField({ target: () => SourceAuthor }),
		title: field.string({ required: true }),
	}),
})

const SourceContract = UltimaBase.Schema.define({
	className: 'SourceContract',
	fields: (field) => ({
		active: field.boolean({ default: false }),
		attachment: field.binary(),
		birthday: field.date(),
		counter: field.int({ autoIncrement: true }),
		createdLocallyAt: field.dateTime({ autoNow: true }),
		details: field.json(),
		displayName: field.string({ required: true }),
		duration: field.time(),
		externalId: field.uuid({ immutable: true, indexed: 'unique' }),
		labels: field.string({ list: true }),
		largeCount: field.bigint(),
		price: field.decimal(),
		profile: field.object({
			fields: (embedded) => ({
				nickname: embedded.string({ required: true }),
				score: embedded.float(),
			}),
		}),
		rating: field.float(),
		status: field.enum({ values: ['draft', 'published'] as const }),
		summaryLength: field.virtual({
			output: (output) => output.int({ nullable: false }),
			resolve: () => 0,
			select: { displayName: true },
		}),
	}),
})

test('derives every Core field family and lifecycle state from source', () => {
	type Item = SchemaItem<typeof SourceContract>
	type Output = SchemaOutput<typeof SourceContract>
	type Create = SchemaCreateData<typeof SourceContract>
	type Update = SchemaUpdateData<typeof SourceContract>

	expectTypeOf<
		SchemaTypeInfoFor<typeof SourceContract>['key']
	>().toEqualTypeOf<'SourceContract'>()
	expectTypeOf<Item['active']>().toEqualTypeOf<boolean | null>()
	expectTypeOf<Item['attachment']>().toEqualTypeOf<Uint8Array | null>()
	expectTypeOf<Item['birthday']>().toEqualTypeOf<string | null>()
	expectTypeOf<Item['counter']>().toBeNumber()
	expectTypeOf<Item['createdLocallyAt']>().toBeString()
	expectTypeOf<Item['details']>().toEqualTypeOf<JsonDocument | null>()
	expectTypeOf<Item['displayName']>().toBeString()
	expectTypeOf<Item['duration']>().toEqualTypeOf<string | null>()
	expectTypeOf<Item['externalId']>().toEqualTypeOf<string | null>()
	expectTypeOf<Item['labels']>().toEqualTypeOf<readonly string[] | null>()
	expectTypeOf<Item['largeCount']>().toEqualTypeOf<bigint | null>()
	expectTypeOf<Item['price']>().toEqualTypeOf<string | null>()
	expectTypeOf<Item['profile']>().toEqualTypeOf<Readonly<{
		readonly nickname: string
		readonly score: number | null
	}> | null>()
	expectTypeOf<Item['rating']>().toEqualTypeOf<number | null>()
	expectTypeOf<Item['status']>().toEqualTypeOf<'draft' | 'published' | null>()
	expectTypeOf<Output['summaryLength']>().toBeNumber()
	// @ts-expect-error -- Virtual outputs are never persisted item fields.
	type PersistedVirtual = Item['summaryLength']
	void (null as unknown as PersistedVirtual)

	expectTypeOf<Create['displayName']>().toBeString()
	expectTypeOf<Create['active']>().toEqualTypeOf<boolean | null | undefined>()
	expectTypeOf<Create['counter']>().toEqualTypeOf<number | undefined>()
	expectTypeOf<Update['createdLocallyAt']>().toEqualTypeOf<string | undefined>()
	// @ts-expect-error -- Immutable fields are absent from update input.
	type UpdatedExternalId = Update['externalId']
	void (null as unknown as UpdatedExternalId)
})

test('drives operation inputs, projections, and results from the source contract', () => {
	const created = SourceContract.createOne({
		data: { displayName: 'Ada' },
		select: { displayName: true, summaryLength: true },
	})
	expectTypeOf(created).toEqualTypeOf<
		Promise<
			QueryResult<typeof SourceContract, 'displayName' | 'id' | 'summaryLength'>
		>
	>()

	const found = SourceContract.findMany({
		orderBy: { displayName: 'asc', rating: 'desc' },
		select: { displayName: true, status: true },
		where: {
			AND: [{ displayName: { startsWith: 'A' } }, { rating: { gte: 4 } }],
			profile: {
				at: [{ path: ['nickname'], startsWith: 'A' }],
			},
		},
	})
	expectTypeOf(found).toEqualTypeOf<
		Promise<
			readonly QueryResult<
				typeof SourceContract,
				'displayName' | 'id' | 'status'
			>[]
		>
	>()

	void SourceContract.updateOne({
		data: { active: true, profile: { nickname: 'Ada' } },
		where: { externalId: { eq: 'profile-1' } },
	})
	void SourceContract.createMany({
		data: [{ displayName: 'Ada' }, { displayName: 'Grace' }],
		select: { displayName: true },
	})
	void SourceContract.findOne({
		select: { displayName: true },
		where: { status: { eq: 'draft' } },
	})
	void SourceContract.findOneOrThrow({
		where: { id: 'source-1' },
		select: { displayName: true },
	})
	void SourceContract.count({ where: { active: { eq: true } } })
	void SourceContract.exists({ where: { displayName: { eq: 'Ada' } } })
	void SourceContract.updateMany({
		data: [
			{
				data: { status: 'published' },
				where: { id: { eq: 'source-1' } },
			},
		],
	})
	void SourceContract.deleteOne({ where: { id: { eq: 'source-1' } } })
	void SourceContract.deleteMany({ where: [{ id: { eq: 'source-1' } }] })
	void SourceContract.upsertOne({
		create: { displayName: 'Ada' },
		update: { status: 'published' },
		where: { externalId: { eq: 'profile-1' } },
	})
	void SourceContract.upsertMany({
		data: [
			{
				create: { displayName: 'Grace' },
				update: { active: true },
				where: { externalId: { eq: 'profile-2' } },
			},
		],
	})

	void SourceContract.createOne({
		// @ts-expect-error -- Required source fields remain required in operations.
		data: {},
	})
	void SourceContract.findMany({
		// @ts-expect-error -- Unknown fields fail before Runtime normalization.
		where: { missing: { eq: true } },
	})
})

test('keeps direct relationship targets exact without a generated registry', () => {
	type Article = SchemaItem<typeof SourceArticle>
	const data: CreateInput<typeof SourceArticle> = {
		author: { connect: SourceAuthor.pointer('author-1') },
		title: 'Source relationships',
	}

	expectTypeOf<Article['author']['schema']>().toEqualTypeOf<
		typeof SourceAuthor
	>()
	// Create data links a pointer through `connect` (ADR-0308, ADR-0310).
	expectTypeOf(data.author).toHaveProperty('connect')

	void SourceArticle.createOne({
		data: {
			author: { create: { name: 'Ada' } },
			reviewers: { connect: ['author-1'] },
			title: 'Source relationships',
		},
		include: {
			author: { select: { name: true } },
			reviewers: {
				orderBy: { name: 'asc' },
				select: { name: true },
				where: { name: { startsWith: 'A' } },
			},
		},
	})
	void SourceArticle.updateOne({
		data: {
			author: { update: { name: 'Grace' } },
			reviewers: { create: [{ name: 'Katherine' }] },
		},
		where: { id: 'article-1' },
	})
	void SourceArticle.findMany({
		where: { reviewers: { some: { name: { startsWith: 'A' } } } },
	})

	void SourceArticle.findMany({
		include: {
			author: {
				select: {
					// @ts-expect-error -- The direct target exposes only Author fields.
					missing: true,
				},
			},
		},
	})
})

test('retains distinct root, nested and list filter capabilities', () => {
	void SourceContract.findMany({
		where: {
			birthday: { between: { lower: '2000-01-01', upper: '2020-01-01' } },
			largeCount: { gt: 1n },
			price: { gte: '1.00' },
			status: { in: ['draft', 'published'] },
			labels: { hasEvery: ['one', 'two'] },
			profile: { at: [{ path: ['score'], eq: 1 }] },
		},
	})
	void SourceContract.findMany({
		// @ts-expect-error -- Boolean equality does not imply scalar ordering.
		where: { active: { gt: false } },
	})
	void SourceContract.findMany({
		// @ts-expect-error -- Enum domains support equality, not scalar ordering.
		where: { status: { gt: 'draft' } },
	})
	void SourceContract.findMany({
		// @ts-expect-error -- Listed scalar fields do not gain root range operators.
		where: { labels: { gt: 'one' } },
	})
	void SourceContract.findMany({
		// @ts-expect-error -- Nested numeric paths deliberately exclude root ordering.
		where: { profile: { at: [{ path: ['score'], gt: 1 }] } },
	})
})
