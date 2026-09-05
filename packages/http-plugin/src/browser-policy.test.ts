import { describe, expect, it, vi } from 'vitest'

import {
	dispatchHttpBrowserRequest,
	normalizeHttpBrowserPolicy,
	type EnabledHttpBrowserPolicy,
} from './browser-policy.js'
import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpRequestIdHeader,
} from './constants.js'

const origin = 'https://console.example'
const policy: EnabledHttpBrowserPolicy = normalizeHttpBrowserPolicy(
	{
		allowedHeaders: [
			httpApplicationIdHeader,
			'Authorization',
			'Content-Type',
			httpRequestIdHeader,
			httpMasterKeyHeader,
		],
		allowedMethods: ['GET', 'POST'],
		allowedOrigins: [origin],
		credentials: true,
		maxAgeSeconds: 600,
	},
	true,
) as EnabledHttpBrowserPolicy

const serverRequest = (
	method: string,
	headers: readonly (readonly [string, string])[],
) => ({
	originalHeaders: headers,
	request: new Request('http://localhost/classes/Post', { method }),
})

describe('HTTP browser policy', () => {
	it('is disabled by default and snapshots every configured collection', () => {
		expect(normalizeHttpBrowserPolicy(undefined, false)).toStrictEqual({
			enabled: false,
		})
		const origins = ['https://one.example']
		const methods = ['GET'] as const
		const headers = [httpApplicationIdHeader]
		const normalized = normalizeHttpBrowserPolicy(
			{
				allowedHeaders: headers,
				allowedMethods: methods,
				allowedOrigins: origins,
				credentials: false,
				maxAgeSeconds: 0,
			},
			false,
		)
		origins.push('https://two.example')
		headers.push('Authorization')
		expect(normalized).toMatchObject({
			allowedHeaders: [httpApplicationIdHeader],
			allowedMethods: ['GET'],
			allowedOrigins: ['https://one.example'],
			enabled: true,
		})
	})

	it.each([
		[
			{
				allowedHeaders: [httpApplicationIdHeader],
				allowedMethods: ['GET'],
				allowedOrigins: '*',
				credentials: true,
				maxAgeSeconds: 0,
			},
			false,
		],
		[
			{
				allowedHeaders: [httpApplicationIdHeader, 'Authorization'],
				allowedMethods: ['GET'],
				allowedOrigins: '*',
				credentials: false,
				maxAgeSeconds: 0,
			},
			false,
		],
		[
			{
				allowedHeaders: [httpApplicationIdHeader],
				allowedMethods: ['GET'],
				allowedOrigins: '*',
				credentials: false,
				maxAgeSeconds: 0,
			},
			true,
		],
	])(
		'rejects wildcard origin with credential-bearing configuration %#',
		(options, masterEnabled) => {
			expect(() => normalizeHttpBrowserPolicy(options, masterEnabled)).toThrow(
				'wildcard origins',
			)
		},
	)

	it('answers accepted preflight without entering application dispatch', async () => {
		const applicationEffects = {
			audit: 0,
			context: 0,
			hooks: 0,
			persistence: 0,
			policy: 0,
			route: 0,
			runtime: 0,
		}
		const next = vi.fn(() => {
			for (const effect of Object.keys(
				applicationEffects,
			) as (keyof typeof applicationEffects)[]) {
				applicationEffects[effect] += 1
			}
			return Promise.resolve(new Response('application behavior'))
		})
		const response = await dispatchHttpBrowserRequest(
			policy,
			serverRequest('OPTIONS', [
				['Origin', origin],
				['Access-Control-Request-Method', 'POST'],
				[
					'Access-Control-Request-Headers',
					`${httpApplicationIdHeader}, Authorization, Content-Type, ${httpRequestIdHeader}`,
				],
			]),
			next,
		)

		expect(next).not.toHaveBeenCalled()
		expect(applicationEffects).toStrictEqual({
			audit: 0,
			context: 0,
			hooks: 0,
			persistence: 0,
			policy: 0,
			route: 0,
			runtime: 0,
		})
		expect(response.status).toBe(204)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
			'true',
		)
		expect(response.headers.get('Access-Control-Max-Age')).toBe('600')
		expect(response.headers.get('Vary')).toBe(
			'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
		)
	})

	it.each([
		['https://rejected.example', 'POST', httpApplicationIdHeader],
		[origin, 'DELETE', httpApplicationIdHeader],
		[origin, 'POST', 'X-Unknown'],
	])(
		'rejects preflight policy mismatch without revealing application behavior %#',
		async (requestOrigin, method, header) => {
			const next = vi.fn<() => Promise<Response>>()
			const response = await dispatchHttpBrowserRequest(
				policy,
				serverRequest('OPTIONS', [
					['Origin', requestOrigin],
					['Access-Control-Request-Method', method],
					['Access-Control-Request-Headers', header],
				]),
				next,
			)
			expect(next).not.toHaveBeenCalled()
			expect(response.status).toBe(204)
			expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
		},
	)

	it('runs real requests normally and reflects only accepted origins', async () => {
		const accepted = await dispatchHttpBrowserRequest(
			policy,
			serverRequest('GET', [['Origin', origin]]),
			() =>
				Promise.resolve(
					new Response('ok', { headers: { Vary: 'Accept-Encoding' } }),
				),
		)
		expect(await accepted.text()).toBe('ok')
		expect(accepted.headers.get('Access-Control-Allow-Origin')).toBe(origin)
		expect(accepted.headers.get('Vary')).toBe('Accept-Encoding, Origin')

		const rejected = await dispatchHttpBrowserRequest(
			policy,
			serverRequest('GET', [['Origin', 'https://rejected.example']]),
			() => Promise.resolve(new Response('still-ran')),
		)
		expect(await rejected.text()).toBe('still-ran')
		expect(rejected.headers.has('Access-Control-Allow-Origin')).toBe(false)
		expect(rejected.headers.get('Vary')).toBe('Origin')
	})

	it.each(['Authorization', 'Cookie', httpMasterKeyHeader])(
		'does not expose wildcard responses carrying %s credentials',
		async (header) => {
			const wildcard = normalizeHttpBrowserPolicy(
				{
					allowedHeaders: [httpApplicationIdHeader],
					allowedMethods: ['GET'],
					allowedOrigins: '*',
					credentials: false,
					maxAgeSeconds: 0,
				},
				false,
			)
			const response = await dispatchHttpBrowserRequest(
				wildcard,
				serverRequest('GET', [
					['Origin', origin],
					[header, 'secret'],
				]),
				() => Promise.resolve(new Response('ran')),
			)
			expect(await response.text()).toBe('ran')
			expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
		},
	)

	it('fails safely when application code also tries to own CORS', async () => {
		const response = await dispatchHttpBrowserRequest(
			policy,
			serverRequest('GET', [['Origin', origin]]),
			() =>
				Promise.resolve(
					new Response('leak', {
						headers: { 'Access-Control-Allow-Origin': '*' },
					}),
				),
		)
		expect(response.status).toBe(500)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_INTERNAL_ERROR' },
		})
		expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
	})
})
