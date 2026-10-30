// Reads and writes the posts as a client would, over GraphQL, each test on a
// new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
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
	// Server code, as Master, writes a published post and a draft.
	await Post.createMany(
		{ data: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
		{ as: master },
	)
	expect(await request('{ posts { edges { node { title } } } }')).toEqual({
		data: { posts: { edges: [{ node: { title: 'Hello' } }] } },
	})
	//#endregion
})

it("refuses a client's write", async () => {
	//#region write
	expect(
		await request('mutation { createPost(data: { title: "Mine" }) { id } }'),
	).toMatchObject({
		data: null,
		errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
	})
	//#endregion
})
