// Reads and writes the posts as a client would, over GraphQL and REST, and
// from server code, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, expectTypeOf, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)

const { check } = requestFiles(new URL('requests/', import.meta.url), running)

it('serves a client the published posts only', async () => {
	//#region seed
	await Post.createMany(
		{ data: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
		{ as: master },
	)
	//#endregion
	await check('read-posts')
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
	await check('list-posts')
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
	await check('create-post')
})
