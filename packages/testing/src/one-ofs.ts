// `oneOf` in the contract (D-247): a `one` to a row of one of its kinds'
// models, each kind a key of its own, read `{ kind, [kind]: row }`, filtered
// by kind and by the fields the kinds share, moved from either side.
import type { Adapter, Identity } from 'ultimabase'
import { allow, defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'target' }),
		notes: f.many(() => Note, { inverse: 'about' }),
	}),
}).with({ access: allow.public })

const Photo = defineModel({
	name: 'Photo',
	fields: (f) => ({
		title: f.string(),
		url: f.string(),
		comments: f.many(() => Comment, { inverse: 'target' }),
		notes: f.many(() => Note, { inverse: 'about' }),
	}),
}).with({ access: allow.public })

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		target: f.oneOf({ post: () => Post, photo: () => Photo }),
	}),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		about: f.oneOf(
			{ post: () => Post, photo: () => Photo },
			{ optional: true, onDelete: 'cascade' },
		),
	}),
}).with({ access: allow.public })

const bodies = async (where: object): Promise<unknown> =>
	Comment.findMany(
		{ where, orderBy: { body: 'asc' }, select: { body: true } },
		M,
	)
const bodied = (...list: readonly string[]) => list.map((body) => ({ body }))

export function oneOfs(create: () => Adapter): void {
	describe('oneOfs', () => {
		started(create, [Post, Photo, Comment, Note])
		let post = ''
		let photo = ''

		beforeEach(async () => {
			post = (await Post.create({ data: { title: 'Loom' } }, M)).id
			const data = { title: 'Sky', url: 'sky.png' }
			photo = (await Photo.create({ data }, M)).id
			await Comment.create(
				{ data: { body: 'a', target: { connect: { post: { id: post } } } } },
				M,
			)
			await Comment.create(
				{ data: { body: 'b', target: { connect: { photo: { id: photo } } } } },
				M,
			)
		})

		it('reads each row with its kind, shaped by kind', async () => {
			const rows = await Comment.findMany(
				{
					orderBy: { body: 'asc' },
					select: {
						body: true,
						target: { post: { select: { title: true } }, photo: true },
					},
				},
				M,
			)
			const shown: unknown = expect.objectContaining({
				title: 'Sky',
				url: 'sky.png',
			})
			expect(rows).toStrictEqual([
				{ body: 'a', target: { kind: 'post', post: { title: 'Loom' } } },
				{
					body: 'b',
					target: {
						kind: 'photo',
						photo: shown,
					},
				},
			])
			const folded = await Comment.findMany(
				{ orderBy: { body: 'asc' }, select: { target: true } },
				M,
			)
			expect(folded.map(({ target }) => target?.kind)).toStrictEqual([
				'post',
				'photo',
			])
		})

		it('filters by kind, by a kind, and by the fields the kinds share', async () => {
			expect(await bodies({ target: { kind: 'photo' } })).toStrictEqual(
				bodied('b'),
			)
			expect(
				await bodies({ target: { photo: { is: { url: 'sky.png' } } } }),
			).toStrictEqual(bodied('b'))
			expect(
				await bodies({ target: { is: { title: { startsWith: 'L' } } } }),
			).toStrictEqual(bodied('a'))
			expect(
				await bodies({ target: { isNot: { title: 'Loom' } } }),
			).toStrictEqual(bodied('b'))
			const counted = await Post.findMany(
				{ select: { _count: { select: { comments: true } } } },
				M,
			)
			expect(counted).toStrictEqual([{ _count: { comments: 1 } }])
		})

		it('moves a row to another kind, from either side', async () => {
			const [a] = await Comment.findMany({ where: { body: 'a' } }, M)
			const id = a?.id ?? ''
			await Comment.update(
				{
					where: { id },
					data: { target: { connect: { photo: { id: photo } } } },
				},
				M,
			)
			expect(await bodies({ target: { kind: 'photo' } })).toStrictEqual(
				bodied('a', 'b'),
			)
			await Post.update(
				{ where: { id: post }, data: { comments: { connect: [{ id }] } } },
				M,
			)
			expect(await bodies({ target: { kind: 'post' } })).toStrictEqual(
				bodied('a'),
			)
			await Comment.update(
				{
					where: { id },
					data: { target: { create: { post: { title: 'New' } } } },
				},
				M,
			)
			expect(
				await bodies({ target: { post: { is: { title: 'New' } } } }),
			).toStrictEqual(bodied('a'))
		})

		it('restricts the delete of a row a required oneOf links', async () => {
			await expect(
				Post.delete({ where: { id: post } }, M),
			).rejects.toMatchObject({
				code: 'RELATION_RESTRICTED',
				details: { model: 'Comment', field: 'target' },
			})
		})

		it('leaves an optional oneOf unset, and cascades its delete', async () => {
			await Note.create({ data: { text: 'loose' } }, M)
			const tied = await Note.create(
				{ data: { text: 'tied', about: { connect: { post: { id: post } } } } },
				M,
			)
			const texts = async (where: object) =>
				(await Note.findMany({ where, orderBy: { text: 'asc' } }, M)).map(
					({ text }) => text,
				)
			expect(await texts({ about: { is: null } })).toStrictEqual(['loose'])
			await Note.update(
				{ where: { id: tied.id }, data: { about: { disconnect: true } } },
				M,
			)
			expect(await texts({ about: { is: null } })).toStrictEqual([
				'loose',
				'tied',
			])
			await Note.update(
				{
					where: { id: tied.id },
					data: { about: { connect: { photo: { id: photo } } } },
				},
				M,
			)
			await Comment.deleteMany({ where: { target: { kind: 'photo' } } }, M)
			await Photo.delete({ where: { id: photo } }, M)
			expect(await texts({})).toStrictEqual(['loose'])
		})
	})
}
