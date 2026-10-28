// Nested creation in the contract (D-128): `create` in a relation write makes
// the rows with the one it writes, at any depth, or none of them.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Blogger = defineModel({
	name: 'Blogger',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post),
		card: f.one(() => Card, { optional: true }),
	}),
})

/** Holds the key of its one-to-one with a blogger (D-37). */
const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		bio: f.string(),
		blogger: f.one(() => Blogger, { onDelete: 'cascade' }),
	}),
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string({ unique: true }),
		blogger: f.one(() => Blogger, { onDelete: 'cascade' }),
		comments: f.many(() => Comment),
		topics: f.many(() => Topic),
	}),
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		post: f.one(() => Post, { onDelete: 'cascade' }),
	}),
})

const Topic = defineModel({
	name: 'Topic',
	fields: (f) => ({ label: f.string(), posts: f.many(() => Post) }),
})

export function nested(create: () => Adapter): void {
	describe('nested creation', () => {
		started(create, [Blogger, Card, Post, Comment, Topic])

		it('creates rows three levels deep with the one it writes', async () => {
			const topic = await Topic.create({ data: { label: 'ts' } }, M)
			const blogger = await Blogger.create(
				{
					data: {
						name: 'Ada',
						card: { create: { bio: 'engines' } },
						posts: {
							create: [
								{
									title: 'First',
									comments: { create: [{ body: 'a' }, { body: 'b' }] },
									topics: {
										connect: [{ id: topic.id }],
										create: [{ label: 'go' }],
									},
								},
								{ title: 'Second' },
							],
						},
					},
					include: {
						card: true,
						posts: { include: { comments: true, topics: true } },
					},
				},
				M,
			)
			expect(blogger).toMatchObject({
				name: 'Ada',
				card: { bio: 'engines' },
				posts: [
					{
						title: 'First',
						comments: [{ body: 'a' }, { body: 'b' }],
						topics: [{ label: 'ts' }, { label: 'go' }],
					},
					{ title: 'Second', comments: [], topics: [] },
				],
			})
			expect(await Comment.count({}, M)).toBe(2)
			expect(await Topic.count({}, M)).toBe(2)
		})

		it('creates the row a stored one links to', async () => {
			const comment = await Comment.create(
				{
					data: {
						body: 'hello',
						post: {
							create: { title: 'Root', blogger: { create: { name: 'Bo' } } },
						},
					},
					include: { post: { include: { blogger: true } } },
				},
				M,
			)
			expect(comment).toMatchObject({
				post: { title: 'Root', blogger: { name: 'Bo' } },
			})
		})

		it('creates rows in an update, beside connect and disconnect', async () => {
			const blogger = await Blogger.create({ data: { name: 'Ada' } }, M)
			const old = await Topic.create({ data: { label: 'old' } }, M)
			const post = await Post.create(
				{
					data: {
						title: 'Kept',
						blogger: { connect: { id: blogger.id } },
						topics: { connect: [{ id: old.id }] },
					},
				},
				M,
			)
			const updated = await Post.update(
				{
					where: { id: post.id },
					data: {
						comments: { create: [{ body: 'late' }] },
						topics: {
							disconnect: [{ id: old.id }],
							create: [{ label: 'new' }],
						},
					},
					include: { comments: true, topics: true },
				},
				M,
			)
			expect(updated).toMatchObject({
				comments: [{ body: 'late' }],
				topics: [{ label: 'new' }],
			})
			const card = await Blogger.update(
				{
					where: { id: blogger.id },
					data: { card: { create: { bio: 'later' } } },
					include: { card: true },
				},
				M,
			)
			expect(card).toMatchObject({ card: { bio: 'later' } })
		})

		it('writes nothing when a row deep down fails', async () => {
			const blogger = await Blogger.create({ data: { name: 'Ada' } }, M)
			await Post.create(
				{
					data: { title: 'Taken', blogger: { connect: { id: blogger.id } } },
				},
				M,
			)
			const failed = Blogger.create(
				{
					data: {
						name: 'Bo',
						posts: {
							create: [
								{ title: 'Fresh', comments: { create: [{ body: 'x' }] } },
								{ title: 'Taken' },
							],
						},
					},
				},
				M,
			)
			await expect(failed).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			expect(await Blogger.count({}, M)).toBe(1)
			expect(await Post.count({}, M)).toBe(1)
			expect(await Comment.count({}, M)).toBe(0)
		})
	})
}
