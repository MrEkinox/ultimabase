// Deletes and restores posts as a client would, over GraphQL, each test on
// a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** A deleted post, "Draft", beside a kept one; returns the deleted one's id. */
async function deleted(): Promise<string> {
	await request('mutation { createPost(data: { title: "Kept" }) { id } }')
	const body = await request(
		'mutation { createPost(data: { title: "Draft" }) { id } }',
	)
	const id = String(at(body, 'data', 'createPost', 'id'))
	await request(
		'mutation ($id: ID!) { deletePost(where: { id: $id }) { id } }',
		{ id },
	)
	return id
}

const posts = '{ posts { edges { node { title } } } }'
const aDate: unknown = expect.any(String)

it('keeps a deleted post out of every read, and in the trash', async () => {
	//#region trash
	await deleted()
	expect(await request(posts)).toEqual({
		data: { posts: { edges: [{ node: { title: 'Kept' } }] } },
	})
	const body = await request('{ trash { title deletedAt } }')
	expect(at(body, 'data', 'trash')).toEqual([
		{ title: 'Draft', deletedAt: aDate },
	])
	//#endregion
})

it('restores a deleted post', async () => {
	const id = await deleted()
	//#region restore
	const restore =
		'mutation ($id: ID!) { restorePost(id: $id) { title deletedAt } }'
	expect(await request(restore, { id })).toEqual({
		data: { restorePost: { title: 'Draft', deletedAt: null } },
	})
	expect(at(await request(posts), 'data', 'posts', 'edges')).toHaveLength(2)
	expect(await request('{ trash { title } }')).toEqual({ data: { trash: [] } })
	// A post that is not deleted has nothing to restore.
	expect(await request(restore, { id })).toMatchObject({
		errors: [{ extensions: { code: 'NOT_FOUND' } }],
	})
	//#endregion
})

it('deletes, reads the trash and restores from server code', async () => {
	//#region commands
	const as = { as: master }
	const post = await Post.create({ data: { title: 'Draft' } }, as)
	const removed = await Post.delete({ where: { id: post.id } }, as)
	expect(removed.deletedAt).toBeInstanceOf(Date)
	// Gone for every read, Master's included; the trash still has it.
	expect(await Post.findUnique({ where: { id: post.id } }, as)).toBeNull()
	expect(await Post.trash.count({}, as)).toBe(1)
	const found = await Post.trash.findUnique({ where: { id: post.id } }, as)
	expect(found?.title).toBe('Draft')
	// deleteMany keeps its rows too.
	await Post.create({ data: { title: 'Old' } }, as)
	expect(await Post.deleteMany({}, as)).toEqual({ count: 1 })
	expect(await Post.trash.count({}, as)).toBe(2)
	const restored = await Post.restore({ where: { id: post.id } }, as)
	expect(restored.deletedAt).toBeNull()
	//#endregion
})

it('lets no client date a post', async () => {
	//#region deleted-at
	const body = await request(
		'mutation { createPost(data: { title: "Old", deletedAt: "2026-01-01T00:00:00Z" }) { id } }',
	)
	expect(body).toMatchObject({
		errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
	})
	//#endregion
})
