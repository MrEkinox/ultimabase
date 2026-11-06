// Turns the maintenance on and off as a deployment pipeline would, and reads
// it as a client does, each test on a new in-memory database. The requests
// are the files of requests/, shown on the page (D-282).
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'

const running = testApplication(app)
const { check } = requestFiles(new URL('requests/', import.meta.url), running)

const master = { 'x-ultimabase-master-key': 'dev-master-key' }

it('turns the maintenance on and off with the maintenance key', async () => {
	await check('turn-on', {}, { status: 200 })
	await check('turn-off', {}, { status: 200 })
})

it('answers 503 to the clients until it ends', async () => {
	await check('turn-on')

	await check('ping', {}, { status: 503 })
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ __typename }' }),
	})
	expect(response.headers.get('retry-after')).toBe('120')

	await check('turn-off')
	const after = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ __typename }' }),
	})
	expect(after.status).toBe(200)
})

it('serves Master meanwhile', async () => {
	await check('turn-on')
	const headers = { 'x-ultimabase-master-key': 'dev-master-key' }
	await check('migrate', {}, { headers, status: 200 })
})

/** Turns the maintenance on, with `headers`. */
async function switching(headers: object): Promise<Response> {
	return fetch(`${running.url}/_ultimabase/maintenance`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ enabled: true }),
	})
}

/** A GraphQL request, as a client sends it. */
async function graphql(headers: object = {}) {
	return fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query: '{ __typename }' }),
	})
}

it('turns on with the maintenance key or the master key only', async () => {
	expect((await switching({})).status).toBe(403)
	expect((await graphql()).status).toBe(200)
	expect((await switching(master)).status).toBe(200)
})

it('lets the maintenance key through nothing else', async () => {
	await check('turn-on')
	const response = await graphql({
		'x-ultimabase-maintenance-key': 'dev-maintenance-key',
	})
	expect(response.status).toBe(503)
})
