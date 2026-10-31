//#region start
// Starts the application before each test, on a new in-memory database and
// a free port, and stops it after.
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Note } from './models.ts'

const running = testApplication(app)
//#endregion

//#region fresh
it('writes a note', async () => {
	await Note.create({ data: { text: 'Milk', ownerId: 'ada' } }, { as: master })
	expect(await Note.count({}, { as: master })).toBe(1)
})

it('starts on an empty database', async () => {
	expect(await Note.count({}, { as: master })).toBe(0)
})
//#endregion

it('acts as a signed-in user', async () => {
	//#region as-user
	// A caller as a session gives it, without signing in.
	const ada = { as: asUser({ id: 'ada' }) }
	const note = await Note.create({ data: { text: 'Milk' } }, ada)
	expect(note.ownerId).toBe('ada')

	const grace = { as: asUser({ id: 'grace' }) }
	expect(await Note.findMany({}, grace)).toEqual([])
	//#endregion
})

it('calls the API over HTTP', async () => {
	//#region http
	await Note.create({ data: { text: 'Milk', ownerId: 'ada' } }, { as: master })
	// `running.url` is the server's address during the test.
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ notes { edges { node { text } } } }' }),
	})
	// Without a session, the caller is anonymous: no note is its own.
	expect(await response.json()).toEqual({ data: { notes: { edges: [] } } })
	//#endregion
})

it('refuses an anonymous note before any query', async () => {
	//#region queries
	// The queries the callback sends to the database, in their order.
	const refused = await running.queries(async () => {
		await expect(Note.create({ data: { text: 'Milk' } })).rejects.toMatchObject(
			{ code: 'ACCESS_DENIED' },
		)
	})
	expect(refused).toEqual([])

	const ada = { as: asUser({ id: 'ada' }) }
	const written = await running.queries(async () => {
		await Note.create({ data: { text: 'Milk' } }, ada)
		await Note.findMany({}, ada)
	})
	expect(written).toEqual(['write Note', 'find Note'])
	//#endregion
})
