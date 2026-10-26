// Deletes and restores posts as a client would, over GraphQL, each test on
// a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { app } from './app.ts'

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
	await deleted()
	expect(await request(posts)).toEqual({
		data: { posts: { edges: [{ node: { title: 'Kept' } }] } },
	})
	const body = await request('{ trash { title deletedAt } }')
	expect(at(body, 'data', 'trash')).toEqual([
		{ title: 'Draft', deletedAt: aDate },
	])
})

it('restores a deleted post', async () => {
	const id = await deleted()
	const restore =
		'mutation ($id: String!) { restorePost(id: $id) { title deletedAt } }'
	expect(await request(restore, { id })).toEqual({
		data: { restorePost: { title: 'Draft', deletedAt: null } },
	})
	expect(at(await request(posts), 'data', 'posts', 'edges')).toHaveLength(2)
	expect(await request('{ trash { title } }')).toEqual({ data: { trash: [] } })
	// A post that is not deleted has nothing to restore.
	expect(await request(restore, { id })).toMatchObject({
		errors: [{ extensions: { code: 'NOT_FOUND' } }],
	})
})
