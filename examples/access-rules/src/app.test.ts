// The rules at work from server code, each test on a new in-memory database:
// `asUser` acts as a signed-in user, as a session would. Its short regions and
// the request file beside it are shown on the page (D-282).
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Article, Comment } from './models.ts'

const { check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

const ada = { as: asUser({ id: 'ada' }) }
const grace = { as: asUser({ id: 'grace' }) }

it('lets a signed-in user write a comment, and no one else', async () => {
	//#region comment
	await Comment.create({ data: { body: 'Well said' } }, ada)
	await expect(
		Comment.create({ data: { body: 'Spam' } }),
	).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	//#endregion
	expect(await Comment.count({})).toBe(1)
})

it('shows each caller the rows its read rule lets through', async () => {
	//#region read-create
	await Article.create(
		{ data: { title: 'Draft', notes: 'Check the dates.' } },
		ada,
	)
	await Article.create(
		{ data: { title: 'Launch', status: 'published', notes: 'Embargo.' } },
		ada,
	)
	//#endregion
	//#region read-rows
	// The filter joins the query: pages and counts stay exact.
	const select = { title: true }
	expect(await Article.findMany({ select }, ada)).toEqual([
		{ title: 'Draft' },
		{ title: 'Launch' },
	])
	expect(await Article.findMany({ select }, grace)).toEqual([
		{ title: 'Launch' },
	])
	expect(await Article.count({}, grace)).toBe(1)
	//#endregion
	//#region read-field
	// A field read rule hides the value, row by row.
	const [launch] = await Article.findMany({}, grace)
	expect(launch).not.toHaveProperty('notes')
	//#endregion
	//#region read-filter
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
	//#region write-owner
	const draft = await Article.create({ data: { title: 'Draft' } }, ada)
	expect(draft.authorId).toBe('ada')

	// Grace reads no draft of Ada's: for her, it does not exist.
	await expect(
		Article.update({ where: { id: draft.id }, data: { title: 'Mine' } }, grace),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
	//#endregion

	//#region write-field
	// A field rule: nobody signs an article for someone else.
	await expect(
		Article.create({ data: { title: 'Fake', authorId: 'grace' } }, ada),
	).rejects.toMatchObject({
		code: 'ACCESS_DENIED',
		message: 'Article create refused.',
		details: { model: 'Article', operation: 'create', field: 'authorId' },
	})
	//#endregion

	//#region write-delete
	await Article.update(
		{ where: { id: draft.id }, data: { status: 'published' } },
		ada,
	)
	// Published, the article can no longer be deleted by its author.
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
	//#region master-filter
	// allow.readOnly is no read rule: the author filters on the field.
	const listed = await Article.findMany(
		{ where: { featured: { equals: true } } },
		ada,
	)
	expect(listed.map(({ id }) => id)).toEqual([draft.id])
	//#endregion
})

it('refuses an anonymous caller over GraphQL', async () => {
	await check('create-anonymous')
})
