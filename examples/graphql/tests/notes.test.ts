import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Note, notes } from '../src/notes.ts'

// The second application: plugins installed one by one, reads only, and the
// application header on every request.
const headers = {
	'content-type': 'application/json',
	'x-ultimabase-application-id': 'notes',
}

it('serves reads at the configured path', async () => {
	await using t = await testApplication(notes)
	await t.asMaster(() => Note.createOne({ data: { text: 'Buy milk' } }))

	//#region notes-query
	const response = await t.fetch('/api/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'notes',
		},
		body: JSON.stringify({ query: '{ findManyNote { nodes { text } } }' }),
	})
	//#endregion notes-query

	expect(response.status).toBe(200)
	expect(response.headers.get('content-type')).toBe(
		'application/graphql-response+json; charset=utf-8',
	)
	expect(await response.json()).toStrictEqual({
		data: { findManyNote: { nodes: [{ text: 'Buy milk' }] } },
	})

	// `default: false`: count, exists and every mutation are off.
	const count = await t.fetch('/api/graphql', {
		method: 'POST',
		headers,
		body: JSON.stringify({ query: '{ countNote }' }),
	})
	expect(count.status).toBe(400)
	expect(await count.json()).toMatchObject({
		errors: [
			{
				message:
					'Cannot query field "countNote" on type "Query". hint: enable graphql: { count: true } on Note',
			},
		],
	})
	const create = await t.fetch('/api/graphql', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			query: 'mutation { createNote(input: { text: "x" }) { id } }',
		}),
	})
	expect(await create.json()).toMatchObject({
		errors: [
			{ message: 'The mutation operation is not supported by the schema.' },
		],
	})
})

it('rejects requests before GraphQL when HTTP refuses them', async () => {
	await using t = await testApplication(notes)

	// Without the required application header.
	const anonymous = await t.fetch('/api/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ health }' }),
	})
	expect(anonymous.status).toBe(401)
	expect(await anonymous.json()).toMatchObject({
		error: { code: 'HTTP_APPLICATION_REJECTED' },
	})
	// `bodyLimit: 512 * 1024` while the body streams.
	const large = await t.fetch('/api/graphql', {
		method: 'POST',
		headers,
		body: JSON.stringify({ query: `{ health }${' '.repeat(600 * 1024)}` }),
	})
	expect(large.status).toBe(413)
	expect(await large.json()).toMatchObject({
		error: { code: 'HTTP_PAYLOAD_TOO_LARGE' },
	})
	// `path: '/api/graphql'` replaces the default route.
	const moved = await t.fetch('/graphql', {
		method: 'POST',
		headers,
		body: JSON.stringify({ query: '{ health }' }),
	})
	expect(moved.status).toBe(404)
})

it('serves Apollo Sandbox at the application path', async () => {
	await using t = await testApplication(notes)

	//#region notes-sandbox
	const page = await t.fetch('/__ultimabase/apps/notes/apollo-sandbox')
	//#endregion notes-sandbox

	expect(page.status).toBe(200)
	expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
	// The page reads the application from its URL and sends the header.
	const html = await page.text()
	expect(html).toContain('/api/graphql')
	expect(html).toContain('X-UltimaBase-Application-Id')
	expect(html).toContain('endpointIsEditable:false')
})
