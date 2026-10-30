// Reads and writes the posts as a client would, over GraphQL and REST, and
// from server code, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, expectTypeOf, it } from 'vitest'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(query: string): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	return response.json()
}

it('serves a client the published posts only', async () => {
	//#region read
	// `{ as: master }` is your server code, past every rule: it writes a
	// published post and a draft.
	await Post.createMany(
		{ data: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
		{ as: master },
	)
	// `request` sends a GraphQL query as an anonymous client would.
	expect(await request('{ posts { edges { node { title } } } }')).toEqual({
		data: { posts: { edges: [{ node: { title: 'Hello' } }] } },
	})
	//#endregion
})

/** A published post and a draft, written as Master. */
async function posts(): Promise<void> {
	await Post.createMany(
		{ data: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
		{ as: master },
	)
}

it('serves the same posts over REST', async () => {
	await posts()
	//#region rest
	// The same rule over REST: the published post, not the draft.
	const response = await fetch(`${running.url}/api/posts`)
	expect(await response.json()).toMatchObject({
		edges: [{ node: { title: 'Hello' } }],
	})
	//#endregion
})

it('applies the rule to server code, typed', async () => {
	await posts()
	//#region server
	// Server code without `{ as }` reads as an anonymous client, so a
	// forgotten caller never leaks a draft. The result is typed from the
	// model: no generated code.
	const found = await Post.findMany({ select: { title: true } })
	expectTypeOf(found).toEqualTypeOf<{ readonly title: string }[]>()
	expect(found).toEqual([{ title: 'Hello' }])
	//#endregion
})

it("refuses a client's write", async () => {
	//#region write
	// No rule opens the writes: a client's mutation is refused.
	expect(
		await request('mutation { createPost(data: { title: "Mine" }) { id } }'),
	).toMatchObject({
		data: null,
		errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
	})
	//#endregion
})
