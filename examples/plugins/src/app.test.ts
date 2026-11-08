// Runs the four plugins as an application does, each test on a new in-memory
// database: the RPC transport, the API keys, publishing and the color type.
// Each request file a page shows is sent here and its response compared with
// its JSON file (D-282).
import type { IncomingMessage } from 'node:http'
import { get } from 'node:http'
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Member } from './member.ts'
import { Article, News } from './models.ts'
import { ApiKey, createApiKey } from './plugins/api-keys.ts'
import { Editor } from './plugins/publishing.ts'

const running = testApplication(app)
const { file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)
const M = { as: master }
const aKey: unknown = expect.any(String)

it('runs a function as the API key owner', async () => {
	//#region api-key
	// Master creates a key; the key itself is shown only here.
	const { key } = await createApiKey.run({ owner: 'ada', name: 'CI' }, M)
	//#endregion
	await check('whoami-key', { key }, { status: 200 })
	await check('whoami', {}, { status: 200 })
	await check('unknown-key', {}, { status: 401 })
	//#region revoked
	// The cache forgets a deleted key: `changed` cleared it.
	await ApiKey.deleteMany({ where: { owner: 'ada' } }, M)
	//#endregion
	await check('revoked', { key }, { status: 401 })
})

it("runs a plugin's function under its plugin's name", async () => {
	const created = await file('create-key', {}, { status: 200 })
	expect(created).toEqual({ output: { key: aKey } })
	// Master only: an anonymous caller is refused.
	await check('create-key-refused', {}, { status: 403 })
})

it('lists the functions for a developer on this machine only', async () => {
	await check('list', {}, { status: 200 })
	//#region list
	// The same request under another host name.
	const response = await new Promise<IncomingMessage>((resolve, reject) => {
		const headers = { host: 'api.example.com' }
		get(`${running.url}/rpc`, { headers }, resolve).on('error', reject)
	})
	response.resume()
	expect(response.statusCode).toBe(404)
	//#endregion
})

it('keeps drafts for editors', async () => {
	const { id } = await Member.create({ data: { name: 'Ada' } }, M)
	//#region drafts
	const ada = asUser({ id })
	await Article.create({ data: { title: 'Draft' } }, { as: ada })
	// A user who is not an editor reads no draft.
	expect(await Article.count({}, { as: ada })).toBe(0)
	//#endregion
	// Nor does an anonymous caller.
	await check('titles-draft', {}, { status: 200 })
	//#region editor
	await Editor.create({ data: { user: { connect: { id } } } }, M)
	expect(await Article.count({}, { as: asUser({ id }) })).toBe(1)
	//#endregion
})

it('publishes a draft', async () => {
	//#region publish
	const draft = await Article.create({ data: { title: 'Launch' } }, M)
	expect(await Article.drafts.count({}, M)).toBe(1)
	const published = await Article.publish({ where: { id: draft.id } }, M)
	expect(published.publishedAt).toBeInstanceOf(Date)
	expect(await Article.drafts.count({}, M)).toBe(0)
	//#endregion
	await check('titles-published', {}, { status: 200 })
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
