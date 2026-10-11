import { describe, expect, it, vi } from 'vitest'

import {
	deriveHttpBrowserPolicy,
	dispatchHttpBrowserRequest,
	normalizeHttpBrowserOptions,
	type EnabledHttpBrowserPolicy,
	type HttpBrowserPolicy,
} from './browser-policy.js'
import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpRequestIdHeader,
} from './constants.js'

const origin = 'https://console.example'
const routes = [
	{ kind: 'route', method: 'GET' },
	{ kind: 'route', method: 'POST' },
] as const

// Normalizes the option, then derives methods and headers as httpPlugin() does.
const browserPolicy = (
	options: unknown,
	derivation: Readonly<{
		credentialResolvers?: boolean
		endpoints?: Parameters<typeof deriveHttpBrowserPolicy>[1]['endpoints']
		masterEnabled?: boolean
	}> = {},
): HttpBrowserPolicy =>
	deriveHttpBrowserPolicy(
		normalizeHttpBrowserOptions(options, derivation.masterEnabled ?? false),
		{
			credentialResolvers: derivation.credentialResolvers ?? false,
			endpoints: derivation.endpoints ?? routes,
			masterEnabled: derivation.masterEnabled ?? false,
		},
	)

const enabled = (value: HttpBrowserPolicy): EnabledHttpBrowserPolicy => {
	if (!value.enabled) throw new TypeError('Expected an enabled policy')
	return value
}

const policy = enabled(
	browserPolicy(
		{ credentials: true, origins: [origin] },
		{ credentialResolvers: true, masterEnabled: true },
	),
)

const serverRequest = (
	method: string,
	headers: readonly (readonly [string, string])[],
) => ({
	originalHeaders: headers,
	request: new Request('http://localhost/classes/Post', { method }),
})

describe('HTTP browser policy', () => {
	it('is disabled by default and snapshots the configured origins', () => {
		expect(browserPolicy(undefined)).toStrictEqual({ enabled: false })
		const origins = ['https://one.example']
		const normalized = browserPolicy({ origins })
		origins.push('https://two.example')
		expect(normalized).toStrictEqual({
			allowedHeaders: [
				'Content-Type',
				httpApplicationIdHeader,
				httpRequestIdHeader,
			],
			allowedMethods: ['GET', 'POST'],
			credentials: false,
			enabled: true,
			maxAgeSeconds: 600,
			origins: ['https://one.example'],
		})
	})

	it('derives methods from routes and mounts and headers from the installed plugins', () => {
		expect(
			enabled(browserPolicy({ origins: [origin] }, { endpoints: [] }))
				.allowedMethods,
		).toStrictEqual([])
		expect(
			enabled(
				browserPolicy(
					{ origins: [origin] },
					{ endpoints: [{ kind: 'mount' }] },
				),
			).allowedMethods,
		).toStrictEqual(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
		expect(policy.allowedHeaders).toStrictEqual([
			'Content-Type',
			httpApplicationIdHeader,
			httpRequestIdHeader,
			'Authorization',
			httpMasterKeyHeader,
		])
		// A wildcard origin never lets browsers send credential headers.
		expect(
			enabled(browserPolicy({ origins: '*' }, { credentialResolvers: true }))
				.allowedHeaders,
		).not.toContain('Authorization')
	})

	it.each([
		[{ credentials: true, origins: '*' }, false, 'wildcard origins'],
		[{ origins: '*' }, true, 'wildcard origins'],
		[{ origins: [] }, false, 'non-empty array'],
		[{ origins: ['https://console.example/'] }, false, 'serialized origins'],
		[{ origins: [origin, origin] }, false, 'duplicates'],
		[{ credentials: 'yes', origins: [origin] }, false, 'boolean'],
		[{ maxAgeSeconds: -1, origins: [origin] }, false, 'non-negative'],
		[{ allowedOrigins: [origin] }, false, 'unknown option: allowedOrigins'],
	])(
		'rejects invalid browser options %#',
		(options, masterEnabled, message) => {
			expect(() => normalizeHttpBrowserOptions(options, masterEnabled)).toThrow(
				message,
			)
		},
	)

	it('refuses a preflight with a clear message when CORS is not enabled', async () => {
		const next = vi.fn<() => Promise<Response>>()
		const response = await dispatchHttpBrowserRequest(
			{ enabled: false },
			serverRequest('OPTIONS', [
				['Origin', origin],
				['Access-Control-Request-Method', 'POST'],
			]),
			next,
		)
		expect(next).not.toHaveBeenCalled()
		expect(response.status).toBe(403)
		expect(await response.json()).toMatchObject({
			error: {
				code: 'HTTP_CORS_DISABLED',
				message: 'CORS is not enabled: configure browser.origins',
			},
		})
		const ordinary = await dispatchHttpBrowserRequest(
			{ enabled: false },
			serverRequest('OPTIONS', [['Origin', origin]]),
			() => Promise.resolve(new Response('ran')),
		)
		expect(await ordinary.text()).toBe('ran')
	})

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
			const wildcard = browserPolicy({ maxAgeSeconds: 0, origins: '*' })
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
