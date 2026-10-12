import { describe, expect, it, vi } from 'vitest'
import { dispatchHttpApplicationRequest } from './server-dispatch.js'
import type { HttpApplication, HttpOriginalHeader } from './application.js'
import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from './constants.js'

// The provider utility retains safe early errors without retaining an application graph.
describe('single-owner HTTP dispatch', () => {
	it('delegates a present owner without replacing input or its protocol response', async () => {
		const response = new Response('protocol')
		const fetch = vi.fn(() => Promise.resolve(response))
		const application: HttpApplication = {
			appId: 'owner',
			authority: { master: { enabled: false } },
			protocolVersion: httpApplicationProtocolVersion,
			originalHeaderMode: httpOriginalHeaderMode,
			routeGraph: {
				browserBootstraps: [],
				endpoints: [],
				mounts: [],
				routes: [],
			},
			requestTimeoutMs: 30_000,
			fetch,
		}
		const input = {
			request: new Request('http://localhost'),
			originalHeaders: [],
		}
		expect(await dispatchHttpApplicationRequest(application, input)).toBe(
			response,
		)
		expect(fetch).toHaveBeenCalledExactlyOnceWith(input)
	})
	it('rejects an absent owner with validated correlation and no cache', async () => {
		const response = await dispatchHttpApplicationRequest(undefined, {
			request: new Request('http://localhost/status'),
			originalHeaders: [
				['X-UltimaBase-Application-Id', 'old'],
				['X-UltimaBase-Request-Id', 'known.request'],
			],
		})
		expect(response.status).toBe(401)
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(response.headers.get('X-UltimaBase-Request-Id')).toBe(
			'known.request',
		)
		expect(await response.json()).toEqual({
			error: {
				code: 'HTTP_APPLICATION_REJECTED',
				message: 'The application or credentials were rejected.',
				requestId: 'known.request',
				retryable: false,
			},
		})
	})
	it.each([
		'X-UltimaBase-Application-Id',
		'X-UltimaBase-Master-Key',
		'Authorization',
		'Cookie',
		'Content-Length',
		'X-UltimaBase-Request-Id',
	])('keeps duplicate %s rejection without an owner', async (name) => {
		const response = await dispatchHttpApplicationRequest(undefined, {
			request: new Request('http://localhost'),
			originalHeaders: [
				[name, 'one'],
				[name.toLowerCase(), 'two'],
			],
		})
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_BAD_REQUEST', retryable: false },
		})
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(response.headers.get('X-UltimaBase-Request-Id')).toBeTruthy()
	})
	it.each([
		{ headers: [['invalid']] },
		{ headers: [['X-UltimaBase-Request-Id', 'invalid request id']] },
	])('sanitizes malformed input without an owner', async ({ headers }) => {
		const response = await dispatchHttpApplicationRequest(undefined, {
			request: new Request('http://localhost'),
			originalHeaders: headers as unknown as readonly HttpOriginalHeader[],
		})
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_BAD_REQUEST' },
		})
	})
})
