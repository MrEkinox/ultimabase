// Sends the request files its page shows, as a client does (D-282).
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Note } from './models.ts'

const running = testApplication(app)
const { check } = requestFiles(new URL('requests/', import.meta.url), running)

it('calls the API over HTTP', async () => {
	await Note.create({ data: { text: 'Milk', ownerId: 'ada' } }, { as: master })
	// Without a session, the caller is anonymous: no note is its own.
	await check('notes', {}, { status: 200 })
})

it('empties the database between end-to-end tests', async () => {
	await Note.create({ data: { text: 'Milk', ownerId: 'ada' } }, { as: master })
	// What an end-to-end test sends first, to `ultimabase dev`.
	await check('reset', {}, { status: 204 })
	expect(await Note.count({}, { as: master })).toBe(0)
})
