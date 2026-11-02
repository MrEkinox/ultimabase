// Turns the maintenance on and off as Master would, and reads it as a client
// does, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { app } from './app.ts'

const running = testApplication(app)

//#region switch
/** Turns the maintenance on or off, with the master key. */
async function maintenance(enabled: boolean): Promise<Response> {
	return fetch(`${running.url}/_ultimabase/maintenance`, {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-master-key': 'dev-master-key',
		},
		body: JSON.stringify({ enabled }),
	})
}
//#endregion

/** A GraphQL request, as a client sends it. */
async function graphql(query: string, headers: object = {}) {
	return fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query }),
	})
}

it('answers 503 to the clients until it ends', async () => {
	//#region on
	const on = await maintenance(true)
	expect(await on.json()).toEqual({ enabled: true })

	const response = await graphql('{ __typename }')
	expect(response.status).toBe(503)
	expect(response.headers.get('retry-after')).toBe('120')
	expect(await response.json()).toEqual({
		code: 'MAINTENANCE',
		message: 'The application is under maintenance.',
		details: { retryAfter: 120 },
	})
	//#endregion

	await maintenance(false)
	expect((await graphql('{ __typename }')).status).toBe(200)
})

it('serves Master meanwhile', async () => {
	await maintenance(true)
	//#region master
	const response = await graphql(
		'mutation { createPost(data: { title: "Migrated" }) { title } }',
		{
			'x-ultimabase-master-key': 'dev-master-key',
		},
	)
	expect(await response.json()).toEqual({
		data: { createPost: { title: 'Migrated' } },
	})
	//#endregion
})

it('turns on with the master key only', async () => {
	const response = await fetch(`${running.url}/_ultimabase/maintenance`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ enabled: true }),
	})
	expect(response.status).toBe(403)
	expect((await graphql('{ __typename }')).status).toBe(200)
})
