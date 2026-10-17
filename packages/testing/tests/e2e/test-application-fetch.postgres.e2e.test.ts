import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import type { PluginDefinition } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'
import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { afterAll, describe, expect, inject, it } from 'vitest'

import { postgresConnectionUriContextKey } from '../../../../tests/fixtures/postgres-context.js'
import { fakeHttpPlugin, urlDatabasePlugin } from './fixtures/url-database.js'

// t.fetch hands one in-memory request to the HTTP plugin's `fetch` export,
// as a local server would (ADR-0327, ADR-0334).
process.env.TEST_DATABASE_URL = inject(postgresConnectionUriContextKey)
afterAll(() => {
	delete process.env.TEST_DATABASE_URL
})
const [setupFile] = ultimabaseTesting().setupFiles
if (setupFile === undefined) throw new Error('No Vitest setup file')
await import(/* @vite-ignore */ setupFile)

interface ReceivedRequest {
	readonly request: Request
	readonly options: object
}

const createApplication = (http?: PluginDefinition) => {
	const database = urlDatabasePlugin().plugin
	return new (UltimaBase.use(
		...(http === undefined ? [database] : [database, http]),
	))({ logger: false, schemas: [] })
}

// Answers with what it received; `fetch` is a method reading its exports.
const recordingApplication = () => {
	const received: ReceivedRequest[] = []
	const exports = {
		received,
		fetch(request: Request, options: object): Response {
			this.received.push({ request, options })
			return new Response('handled', { status: 202 })
		},
	}
	return { received, ultimabase: createApplication(fakeHttpPlugin(exports)) }
}

describe('t.fetch', () => {
	it('sends the request from the local peer 127.0.0.1 by default', async () => {
		const { received, ultimabase } = recordingApplication()
		const t = await testApplication(ultimabase)
		const response = await t.fetch('/api/classes/Task?limit=2', {
			body: JSON.stringify({ title: 'Ship' }),
			headers: { 'x-request-id': 'r1' },
			method: 'POST',
		})
		expect(response.status).toBe(202)
		expect(await response.text()).toBe('handled')
		expect(received).toHaveLength(1)
		const [{ request, options } = { request: undefined, options: {} }] =
			received
		expect(request?.url).toBe('http://localhost/api/classes/Task?limit=2')
		expect(request?.method).toBe('POST')
		expect(request?.headers.get('x-request-id')).toBe('r1')
		expect(await request?.json()).toStrictEqual({ title: 'Ship' })
		expect(options).toStrictEqual({ remoteAddress: '127.0.0.1' })
	})

	it('sends another peer, or none when remoteAddress is explicitly undefined', async () => {
		const { received, ultimabase } = recordingApplication()
		const t = await testApplication(ultimabase)
		await t.fetch('/a', undefined, { remoteAddress: '203.0.113.7' })
		await t.fetch('/b', undefined, { remoteAddress: undefined })
		await t.fetch('/c', undefined, {})
		expect(received.map(({ options }) => options)).toStrictEqual([
			{ remoteAddress: '203.0.113.7' },
			{ remoteAddress: undefined },
			{ remoteAddress: '127.0.0.1' },
		])
	})

	it('explains that it needs the HTTP plugin', async () => {
		const t = await testApplication(createApplication())
		const error: unknown = await t
			.fetch('/health')
			.catch((caught: unknown) => caught)
		expect(error).toBeInstanceOf(TypeError)
		expect(error).toHaveProperty(
			'message',
			't.fetch needs the HTTP plugin: install apiServer() or httpPlugin() in the application',
		)
		// The plugin lookup failure stays attached for diagnosis.
		expect(error).toHaveProperty('cause')
	})

	it.for([
		['an object without fetch', { status: 'ok' }],
		['no object', null],
	] as const)('refuses an HTTP plugin that exports %s', async ([, exports]) => {
		const t = await testApplication(createApplication(fakeHttpPlugin(exports)))
		await expect(t.fetch('/health')).rejects.toThrow(
			'The HTTP plugin of this application exports no fetch',
		)
	})

	it('refuses a fetch export that does not answer a Response', async () => {
		const exports = { fetch: () => Promise.resolve({ status: 200 }) }
		const t = await testApplication(createApplication(fakeHttpPlugin(exports)))
		await expect(t.fetch('/health')).rejects.toThrow(
			'The HTTP plugin fetch did not return a Response',
		)
	})
})
