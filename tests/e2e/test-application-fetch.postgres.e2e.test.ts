import process from 'node:process'

import { UltimaBase, type Logger } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import {
	httpContextResolver,
	httpPlugin,
	provideHttpContextResolvers,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { beforeEach, describe, expect, inject, it, vi } from 'vitest'

import { postgresConnectionUriContextKey } from '../fixtures/postgres-context.js'

// ADR-0334 amendment: t.fetch behaves like a local server, whose socket
// peer is the loopback address, unless a test chooses another peer or none.
// The missing-address warning is once per process, so the test without a
// peer comes last.
process.env.TEST_DATABASE_URL = inject(postgresConnectionUriContextKey)

const seen: (string | undefined)[] = []
const warn = vi.fn<Logger['warn']>()

const clientAddresses = plugin({
	id: 'fixture.test-application-fetch',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		provideHttpContextResolvers({
			contributionId: 'client-address',
			create: () => [
				httpContextResolver({
					resolve: ({ clientAddress, context }) => {
						seen.push(clientAddress)
						return context
					},
				}),
			],
		}),
	],
})

const ultimabase = new (UltimaBase.use(
	httpPlugin({ routes: { 'GET /ping': () => new Response('pong') } }),
	clientAddresses,
	postgresPlugin(),
))({
	logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
	schemas: [],
})

const missingAddressWarnings = () =>
	warn.mock.calls.filter(([message]) =>
		message.includes('An HTTP request has no client address'),
	)

beforeEach(() => {
	seen.length = 0
})

describe('t.fetch', () => {
	it('sends requests from the loopback peer by default', async () => {
		await using t = await testApplication(ultimabase)
		expect((await t.fetch('/ping')).status).toBe(200)
		await t.fetch('/ping', { method: 'GET' }, {})
		expect(seen).toStrictEqual(['127.0.0.1', '127.0.0.1'])
		expect(missingAddressWarnings()).toStrictEqual([])
	})

	it('sends requests from the peer a test chooses', async () => {
		await using t = await testApplication(ultimabase)
		await t.fetch('/ping', undefined, { remoteAddress: '203.0.113.7' })
		expect(seen).toStrictEqual(['203.0.113.7'])
		expect(missingAddressWarnings()).toStrictEqual([])
	})

	it('sends requests without a peer when a test asks for none', async () => {
		await using t = await testApplication(ultimabase)
		await t.fetch('/ping', undefined, { remoteAddress: undefined })
		await t.fetch('/ping', undefined, { remoteAddress: undefined })
		expect(seen).toStrictEqual([undefined, undefined])
		expect(missingAddressWarnings()).toHaveLength(1)
	})
})
