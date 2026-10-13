import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import type { UniqueWhereInput } from '../../schema/index.js'

// ADR-0332: commands that need one row type their target with the schema's
// unique-target input, one member per target Runtime accepts.
const Author = UltimaBase.Schema.define({
	className: 'UniqueTargetAuthor',
	fields: (field) => ({
		handle: field.string({ indexed: 'unique', required: true }),
		name: field.string(),
	}),
})

const Tag = UltimaBase.Schema.define({
	className: 'UniqueTargetTag',
	fields: (field) => ({ label: field.string() }),
})

const Post = UltimaBase.Schema.define({
	className: 'UniqueTargetPost',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		code: field.uuid({ indexed: 'unique' }),
		labels: field.string({ list: true }),
		metadata: field.json(),
		profile: field.object({
			fields: (field) => ({ email: field.string() }),
		}),
		rank: field.int({ indexed: true }),
		slug: field.string({ required: true }),
		status: field.enum({ values: ['draft', 'published'] }),
		tags: field.relation({ target: () => Tag }),
		title: field.string(),
	}),
	indexes: [
		{ fields: ['author', 'slug'], unique: true },
		{ fields: ['title', 'rank'] },
	],
})

test('accepts id, each unique field and each complete unique index', () => {
	void Post.updateOne({ where: { id: 'post-1' }, data: { title: 'Updated' } })
	void Post.updateOne({
		where: { id: { eq: 'post-1' } },
		data: { title: 'Updated' },
	})
	void Post.deleteOne({
		where: { code: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
	})
	void Post.deleteOne({
		where: { code: { eq: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } },
	})
	void Post.upsertOne({
		where: { author: 'author-1', slug: 'hello' },
		create: { slug: 'hello' },
		update: { title: 'Hello' },
	})
	void Post.upsertOne({
		where: { author: Author.pointer('author-1'), slug: { eq: 'hello' } },
		create: { slug: 'hello' },
		update: { title: 'Hello' },
	})
	void Author.updateOne({ where: { handle: 'ada' }, data: { name: 'Ada' } })
	void Post.updateMany({
		data: [{ where: { id: 'post-1' }, data: { title: 'Updated' } }],
	})
	void Post.deleteMany({
		where: [{ id: 'post-1' }, { author: 'a', slug: 'b' }],
	})
	void Post.upsertMany({
		data: [
			{
				where: { slug: 'hello', author: 'author-1' },
				create: { slug: 'hello' },
				update: { title: 'Hello' },
			},
		],
	})

	expectTypeOf<{ readonly id: string }>().toExtend<
		UniqueWhereInput<typeof Post>
	>()
	expectTypeOf<{ readonly handle: { readonly eq: string } }>().toExtend<
		UniqueWhereInput<typeof Author>
	>()
})

test('rejects targets Runtime refuses', () => {
	// @ts-expect-error -- `title` is not unique.
	void Post.updateOne({ where: { title: 'Hello' }, data: { rank: 1 } })
	// @ts-expect-error -- `rank` has a regular, not a unique, index.
	void Post.deleteOne({ where: { rank: 1 } })
	// @ts-expect-error -- `slug` alone is a partial composite index.
	void Post.deleteOne({ where: { slug: 'hello' } })
	// @ts-expect-error -- `title, rank` is not a unique index.
	void Post.deleteOne({ where: { title: 'Hello', rank: 1 } })
	// @ts-expect-error -- A filter beside a unique target is refused.
	void Post.deleteOne({ where: { id: 'post-1', title: 'Hello' } })
	// @ts-expect-error -- Two unique targets are not one target.
	void Post.deleteOne({ where: { id: 'post-1', code: 'code-1' } })
	// @ts-expect-error -- A unique target is never null.
	void Post.deleteOne({ where: { id: null } })
	// @ts-expect-error -- A unique target is never `{ eq: null }`.
	void Post.deleteOne({ where: { code: { eq: null } } })
	// @ts-expect-error -- Only equality identifies one row.
	void Post.deleteOne({ where: { id: { in: ['post-1'] } } })
	// @ts-expect-error -- Logical operators never identify one row.
	void Post.deleteOne({ where: { AND: [{ id: 'post-1' }] } })
	// @ts-expect-error -- An empty target identifies nothing.
	void Post.deleteOne({ where: {} })
	void Post.updateMany({
		// @ts-expect-error -- Bulk items keep the unique target.
		data: [{ where: { title: 'Hello' }, data: { rank: 1 } }],
	})
	// @ts-expect-error -- Bulk deletes keep the unique target.
	void Post.deleteMany({ where: [{ slug: 'hello' }] })
	void Post.upsertMany({
		data: [
			{
				// @ts-expect-error -- Bulk upserts keep the unique target.
				where: { title: 'Hello' },
				create: { slug: 'hello' },
				update: { title: 'Hello' },
			},
		],
	})
	void Post.upsertOne({
		// @ts-expect-error -- Upserts keep the unique target.
		where: { slug: 'hello' },
		create: { slug: 'hello' },
		update: { title: 'Hello' },
	})

	// Reads keep the complete filter.
	void Post.findOne({ where: { title: 'Hello', rank: { gt: 1 } } })
	void Post.findMany({ where: { OR: [{ slug: 'a' }, { slug: 'b' }] } })
	void Post.count({ where: { title: null } })
	void Post.exists({ where: { rank: { in: [1, 2] } } })
})

// ADR-0332 amendment: partial unique indexes and those of `.with` are
// storage indexes, not unique targets, in the types as at runtime.
const Slot = UltimaBase.Schema.define({
	className: 'UniqueTargetSlot',
	fields: (field) => ({
		archived: field.boolean(),
		code: field.string(),
		region: field.string(),
		slug: field.string(),
	}),
	indexes: [
		{
			fields: ['region'],
			unique: true,
			where: { createdAt: { gte: '2026-01-01T00:00:00.000Z' } },
		},
	],
}).with({
	indexes: [
		{ fields: ['slug'], unique: true },
		{ fields: ['code'], unique: true, where: { archived: false } },
	],
})

test('rejects partial unique indexes and unique indexes of .with', () => {
	void Slot.deleteOne({ where: { id: 'slot-1' } })
	// @ts-expect-error -- A partial unique index of define is not a target.
	void Slot.deleteOne({ where: { region: 'eu' } })
	// @ts-expect-error -- A unique index of `.with` is not a target.
	void Slot.updateOne({ where: { slug: 'hello' }, data: { region: 'eu' } })
	void Slot.upsertOne({
		// @ts-expect-error -- A partial unique index of `.with` is not a target.
		where: { code: 'c-1' },
		create: { code: 'c-1' },
		update: { region: 'eu' },
	})
})

test('orders only by non-list scalar and enum fields', () => {
	void Post.findMany({
		orderBy: {
			code: 'asc',
			createdAt: 'desc',
			id: 'asc',
			rank: null,
			slug: 'asc',
			status: 'desc',
			title: 'asc',
		},
	})
	// @ts-expect-error -- Pointers have no portable order.
	void Post.findMany({ orderBy: { author: 'asc' } })
	// @ts-expect-error -- Relations have no order.
	void Post.findMany({ orderBy: { tags: 'asc' } })
	// @ts-expect-error -- Lists have no order.
	void Post.findMany({ orderBy: { labels: 'asc' } })
	// @ts-expect-error -- JSON has no order.
	void Post.findMany({ orderBy: { metadata: 'asc' } })
	// @ts-expect-error -- Objects have no order.
	void Post.findOne({ orderBy: { profile: 'desc' } })
})
