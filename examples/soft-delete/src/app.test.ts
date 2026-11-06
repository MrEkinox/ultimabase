// Deletes and restores posts as a client would, over GraphQL, each test on
// a new in-memory database. Its short regions and the request files beside it
// are shown on the page (D-282).
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Post, Tag } from './models.ts'

const { send, file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

const as = { as: master }
const aDate: unknown = expect.any(String)

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** A deleted post, "Draft", beside a kept one; returns the deleted one's id. */
async function deleted(): Promise<string> {
	await send('mutation { createPost(data: { title: "Kept" }) { id } }')
	const body = await send(
		'mutation { createPost(data: { title: "Draft" }) { id } }',
	)
	const id = String(at(body, 'data', 'createPost', 'id'))
	await check('delete', { id })
	return id
}

it('keeps a deleted post out of every read, and in the trash', async () => {
	await deleted()
	await check('posts')
	await check('trash')
})

it('dates a deleted post', async () => {
	await deleted()
	const body = await send('{ trash { title deletedAt } }')
	expect(at(body, 'data', 'trash')).toEqual([
		{ title: 'Draft', deletedAt: aDate },
	])
})

it('restores a deleted post', async () => {
	const id = await deleted()
	await check('restore', { id })
	expect(
		at(
			await send('{ posts { edges { node { id } } } }'),
			'data',
			'posts',
			'edges',
		),
	).toHaveLength(2)
	expect(await send('{ trash { title } }')).toEqual({ data: { trash: [] } })
	// A post that is not deleted has nothing to restore.
	expect(await file('restore', { id })).toMatchObject({
		errors: [{ extensions: { code: 'NOT_FOUND' } }],
	})
})

it('deletes, reads the trash and restores from server code', async () => {
	//#region commands
	const post = await Post.create({ data: { title: 'Draft' } }, as)
	const removed = await Post.delete({ where: { id: post.id } }, as)
	expect(removed.deletedAt).toBeInstanceOf(Date)
	// Gone for every read, Master's included; the trash still has it.
	expect(await Post.findUnique({ where: { id: post.id } }, as)).toBeNull()
	expect(await Post.trash.count({}, as)).toBe(1)
	//#endregion
	//#region trash-find
	const found = await Post.trash.findUnique({ where: { id: post.id } }, as)
	expect(found?.title).toBe('Draft')
	//#endregion
	//#region delete-many
	await Post.create({ data: { title: 'Old' } }, as)
	expect(await Post.deleteMany({}, as)).toEqual({ count: 1 })
	expect(await Post.trash.count({}, as)).toBe(2)
	//#endregion
	//#region restore-row
	const restored = await Post.restore({ where: { id: post.id } }, as)
	expect(restored.deletedAt).toBeNull()
	//#endregion
})

it('keeps the name of a deleted tag taken', async () => {
	//#region unique
	const tag = await Tag.create({ data: { name: 'news' } }, as)
	await Tag.delete({ where: { id: tag.id } }, as)
	await expect(
		Tag.create({ data: { name: 'news' } }, as),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		details: { model: 'Tag', fields: ['name'] },
	})
	//#endregion
})

it('gives the title of a deleted post back', async () => {
	//#region unique-free
	const post = await Post.create({ data: { title: 'Draft' } }, as)
	await Post.delete({ where: { id: post.id } }, as)
	await Post.create({ data: { title: 'Draft' } }, as)
	// The deleted post comes back only once its title is free again.
	await expect(
		Post.restore({ where: { id: post.id } }, as),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	//#endregion
})

it('lets no client date a post', async () => {
	await check('date')
})
