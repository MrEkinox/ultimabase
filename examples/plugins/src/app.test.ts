// Runs the four plugins as an application does, each test on a new in-memory
// database: the RPC transport, the API keys, publishing and the color type.
import { request } from 'node:http'
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Article, News } from './models.ts'
import { ApiKey, createApiKey } from './plugins/api-keys.ts'
import { Editor } from './plugins/publishing.ts'

const running = testApplication(app)
const M = { as: master }
const aKey: unknown = expect.any(String)

//#region call
/** What a client sends: `POST /rpc/<name>`, with its headers. */
const call = async (
	name: string,
	input: unknown = {},
	headers: Record<string, string> = {},
) => {
	const response = await fetch(`${running.url}/rpc/${name}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(input),
	})
	return { status: response.status, body: await response.json() }
}
//#endregion

it('runs a function as the API key owner', async () => {
	//#region api-key
	// Master creates a key; the key itself is shown only here.
	const { key } = await createApiKey.run({ owner: 'ada', name: 'CI' }, M)
	expect(await call('whoami', {}, { 'x-api-key': key })).toEqual({
		status: 200,
		body: { output: { user: 'ada', editor: false } },
	})
	expect(await call('whoami')).toEqual({
		status: 200,
		body: { output: { user: null, editor: false } },
	})
	//#endregion
	//#region unknown-key
	expect(await call('whoami', {}, { 'x-api-key': 'guess' })).toEqual({
		status: 401,
		body: { code: 'UNAUTHENTICATED', message: 'This API key is unknown.' },
	})
	//#endregion
	//#region revoked
	// The cache forgets a deleted key: `changed` cleared it.
	await ApiKey.deleteMany({ where: { owner: 'ada' } }, M)
	expect((await call('whoami', {}, { 'x-api-key': key })).status).toBe(401)
	//#endregion
})

it("runs a plugin's function under its plugin's name", async () => {
	//#region plugin-function
	const created = await call(
		'apiKeys.createApiKey',
		{ owner: 'ada', name: 'CI' },
		{ 'x-ultimabase-master-key': 'dev-master-key' },
	)
	expect(created).toEqual({
		status: 200,
		body: { output: { key: aKey } },
	})
	// Master only: an anonymous caller is refused.
	expect(
		await call('apiKeys.createApiKey', { owner: 'ada', name: 'CI' }),
	).toEqual({
		status: 403,
		body: {
			code: 'ACCESS_DENIED',
			message: 'createApiKey refused.',
			details: { function: 'createApiKey' },
		},
	})
	//#endregion
})

it('lists the functions for a developer on this machine only', async () => {
	//#region list
	const listed = await fetch(`${running.url}/rpc`)
	expect(await listed.json()).toEqual([
		'whoami',
		'titles',
		'apiKeys.createApiKey',
	])
	// The same request under another host name.
	const status = await new Promise<number | undefined>((resolve, reject) => {
		const sent = request(`${running.url}/rpc`, {
			headers: { host: 'api.example.com' },
		})
		sent.on('response', (response) => {
			response.resume()
			resolve(response.statusCode)
		})
		sent.on('error', reject)
		sent.end()
	})
	expect(status).toBe(404)
	//#endregion
})

it('keeps drafts for editors', async () => {
	//#region drafts
	const ada = asUser({ id: 'ada' })
	await Article.create({ data: { title: 'Draft' } }, { as: ada })
	// An anonymous caller and a user who is not an editor read no draft.
	expect(await call('titles')).toEqual({ status: 200, body: { output: [] } })
	expect(await Article.count({}, { as: ada })).toBe(0)
	//#endregion
	//#region editor
	await Editor.create({ data: { userId: 'ada' } }, M)
	expect(await Article.count({}, { as: asUser({ id: 'ada' }) })).toBe(1)
	//#endregion
})

it('publishes a draft', async () => {
	//#region publish
	const draft = await Article.create({ data: { title: 'Launch' } }, M)
	expect(await Article.drafts.count({}, M)).toBe(1)
	const published = await Article.publish({ where: { id: draft.id } }, M)
	expect(published.publishedAt).toBeInstanceOf(Date)
	expect(await Article.drafts.count({}, M)).toBe(0)
	expect(await call('titles')).toEqual({
		status: 200,
		body: { output: ['Launch'] },
	})
	//#endregion
})

it('lets only an editor date a row', async () => {
	//#region not-editor
	const bob = asUser({ id: 'bob' })
	const draft = await Article.create({ data: { title: 'Launch' } }, M)
	// Bob does not read the draft, so it is not found for him.
	await expect(
		Article.publish({ where: { id: draft.id } }, { as: bob }),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(
		Article.create(
			{ data: { title: 'Mine', publishedAt: new Date() } },
			{ as: bob },
		),
	).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	//#endregion
})

it('unpublishes a deleted row', async () => {
	//#region unpublish
	const news = await News.create({ data: { title: 'Open' } }, M)
	await News.delete({ where: { id: news.id } }, M)
	// The row stays, as a draft: nobody else reads it.
	expect(await News.count({}, { as: asUser({ id: 'bob' }) })).toBe(0)
	expect(await News.drafts.findMany({}, M)).toMatchObject([
		{ title: 'Open', publishedAt: null },
	])
	//#endregion
})

it('publishes news on creation', async () => {
	//#region publish-on-create
	const news = await News.create({ data: { title: 'Open' } }, M)
	expect(news.publishedAt).toBeInstanceOf(Date)
	expect(await News.count({}, { as: asUser({ id: 'bob' }) })).toBe(1)
	//#endregion
})

it('reads a color as its channels', async () => {
	//#region color
	const red = await Article.create(
		{ data: { title: 'Red', accent: '#b91c1c' } },
		M,
	)
	expect(red.accent).toEqual({ red: 185, green: 28, blue: 28 })
	// The default, and a write as channels.
	const blue = await Article.create({ data: { title: 'Blue' } }, M)
	expect(blue.accent).toEqual({ red: 29, green: 78, blue: 216 })
	const green = await Article.create(
		{ data: { title: 'Green', accent: { red: 21, green: 128, blue: 61 } } },
		M,
	)
	expect(green.accent).toEqual({ red: 21, green: 128, blue: 61 })
	//#endregion
	//#region palette
	await expect(
		Article.create({ data: { title: 'Pink', accent: '#ff00ff' } }, M),
	).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	//#endregion
})
