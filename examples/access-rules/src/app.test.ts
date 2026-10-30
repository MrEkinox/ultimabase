// The rules at work from server code, each test on a new in-memory database:
// `asUser` acts as a signed-in user, as a session would.
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Article } from './models.ts'

const running = testApplication(app)

const ada = { as: asUser({ id: 'ada' }) }
const grace = { as: asUser({ id: 'grace' }) }
const titles = (rows: readonly { readonly title: string }[]): string[] =>
	rows.map((row) => row.title)

it('shows each caller the rows its read rule lets through', async () => {
	//#region read
	await Article.create(
		{ data: { title: 'Draft', notes: 'Check the dates.' } },
		ada,
	)
	await Article.create(
		{ data: { title: 'Launch', status: 'published', notes: 'Embargo.' } },
		ada,
	)
	// The filter joins the query: pages and counts stay exact.
	expect(titles(await Article.findMany({}, ada))).toEqual(['Draft', 'Launch'])
	expect(titles(await Article.findMany({}, grace))).toEqual(['Launch'])
	expect(await Article.count({}, grace)).toBe(1)
	// A field read rule hides the value, row by row.
	const [launch] = await Article.findMany({}, grace)
	expect(launch).not.toHaveProperty('notes')
	// Nor can a filter guess it.
	await expect(
		Article.findMany({ where: { notes: { contains: 'E' } } }, grace),
	).rejects.toMatchObject({
		code: 'INVALID_QUERY',
		message:
			'where.notes: Article.notes has a read rule; only Master filters on it.',
	})
	//#endregion
})

it('refuses a write its rule does not allow', async () => {
	//#region write
	const draft = await Article.create({ data: { title: 'Draft' } }, ada)
	expect(draft.authorId).toBe('ada')

	// Grace reads no draft of Ada's: for her, it does not exist.
	await expect(
		Article.update({ where: { id: draft.id }, data: { title: 'Mine' } }, grace),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })

	// A field rule: nobody signs an article for someone else.
	await expect(
		Article.create({ data: { title: 'Fake', authorId: 'grace' } }, ada),
	).rejects.toMatchObject({
		code: 'ACCESS_DENIED',
		message: 'Article create refused.',
		details: { model: 'Article', operation: 'create', field: 'authorId' },
	})

	// Published, the article can no longer be deleted by its author.
	await Article.update(
		{ where: { id: draft.id }, data: { status: 'published' } },
		ada,
	)
	await expect(
		Article.delete({ where: { id: draft.id } }, ada),
	).rejects.toMatchObject({
		code: 'ACCESS_DENIED',
		details: { model: 'Article', operation: 'delete' },
	})
	//#endregion
})

it('lets Master skip every rule', async () => {
	//#region master
	const draft = await Article.create({ data: { title: 'Draft' } }, ada)
	await expect(
		Article.update({ where: { id: draft.id }, data: { featured: true } }, ada),
	).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	const featured = await Article.update(
		{ where: { id: draft.id }, data: { featured: true } },
		{ as: master },
	)
	expect(featured.featured).toBe(true)
	//#endregion
})

it('refuses an anonymous caller over GraphQL', async () => {
	//#region graphql
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: 'mutation { createArticle(data: { title: "Hi" }) { id } }',
		}),
	})
	expect(await response.json()).toMatchObject({
		errors: [
			{
				message: 'Article create refused.',
				extensions: { code: 'ACCESS_DENIED' },
			},
		],
	})
	//#endregion
})
