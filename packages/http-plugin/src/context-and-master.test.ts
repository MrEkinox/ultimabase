import { onTestFinished } from 'vitest'
import {
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	UltimaBase,
	definePlugin,
	getCurrentRequest,
	requireCapability,
	type MasterAccessEvent,
	type PluginDefinition,
	type PluginPrivilegePolicy,
} from '@ultimabase/core'
import { isUnknownArray } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
	type HttpOriginalHeader,
	type HttpServerRequest,
} from './application.js'
import {
	httpContextResolver,
	provideHttpContextResolvers,
	type HttpContextResolverDefinition,
} from './context.js'
import { httpRoute, provideHttpEndpoints } from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const applicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const principal = new RequestContextValue<Readonly<{ readonly id: string }>>(
	'fixture.http.principal',
	(value) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('HTTP fixture principal must contain an ID')
		}
		return Object.freeze({ id: value.id })
	},
)
const resolverTrace = new RequestContextValue<readonly string[]>(
	'fixture.http.resolver-trace',
	(value) => {
		if (
			!isUnknownArray(value) ||
			value.some((entry) => typeof entry !== 'string')
		) {
			throw new TypeError('HTTP fixture resolver trace must contain strings')
		}
		return Object.freeze([...value]) as readonly string[]
	},
)

const resolverPlugin = (
	pluginId: string,
	definitions: readonly HttpContextResolverDefinition[],
) =>
	definePlugin({
		pluginId,
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: [
			provideHttpContextResolvers({
				contributionId: 'fixture-context',
				create: () => definitions,
			}),
		],
	})

interface StartHttpFixtureOptions {
	readonly appId?: string
	readonly handler: (request: Request) => Promise<Response> | Response
	readonly masterAuthority?: MasterAuthority
	readonly masterEnabled?: boolean
	readonly pluginPrivileges?: PluginPrivilegePolicy
	readonly requestTimeoutMs?: number
	readonly resolvers?: readonly PluginDefinition[]
}

const startHttpFixture = async (options: StartHttpFixtureOptions) => {
	let http: HttpApplication | undefined
	const routeOwner = definePlugin({
		pluginId: 'fixture.http-context-route',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{ name: 'transport:expose', reason: 'Exposes the HTTP context fixture.' },
		],
		capabilities: [
			provideHttpEndpoints({
				contributionId: 'context-route',
				create: () =>
					httpRoute({
						method: 'POST',
						path: '/context',
						protocol: { name: 'fixture.http-context', version: '1' },
						handle: options.handler,
					}),
			}),
		],
	})
	const server = definePlugin({
		pluginId: 'fixture.http-context-server',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: [applicationRequirement],
		setup: ({ capabilities }) => {
			http = capabilities.get(applicationRequirement)
		},
	})
	const runtime = new UltimaBase({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		pluginPrivileges: options.pluginPrivileges ?? { logger: false },
		plugins: [
			httpTestDatabasePlugin(),
			...(options.resolvers ?? []),
			routeOwner,
			httpPlugin({
				appId: options.appId ?? 'context-app',
				...(options.masterEnabled === true
					? { master: { enabled: true as const } }
					: {}),
				...(options.requestTimeoutMs === undefined
					? {}
					: { requestTimeoutMs: options.requestTimeoutMs }),
			}),
			server,
		],
		schemas: [],
	})
	onTestFinished(() => runtime.dispose())
	await runtime.start()
	if (http === undefined)
		throw new TypeError('HTTP context fixture was not set up')
	return { http, runtime }
}

const serverRequest = (
	appId: string,
	originalHeaders: readonly HttpOriginalHeader[] = [],
	requestInit: RequestInit = {},
): HttpServerRequest => {
	const headers = new Headers(requestInit.headers)
	for (const [name, value] of originalHeaders) headers.append(name, value)
	return {
		originalHeaders: [
			['X-UltimaBase-Application-Id', appId],
			...originalHeaders,
		],
		request: new Request('http://localhost/context', {
			...requestInit,
			body: requestInit.body ?? '{}',
			headers,
			method: 'POST',
		}),
	}
}

describe('HTTP context resolution', () => {
	it('composes ordered typed values and keeps credentials out of the handler', async () => {
		const observations: string[] = []
		const credentials = resolverPlugin('fixture.http-credentials', [
			httpContextResolver({
				resolve: ({ context, request }) => {
					observations.push(
						`credentials:${String(getCurrentRequest() === context)}`,
					)
					return context.withValue(principal, {
						id: request.headers.get('Authorization') ?? 'missing',
					})
				},
			}),
		])
		const enrichment = resolverPlugin('fixture.http-enrichment', [
			httpContextResolver({
				resolve: ({ context }) => {
					observations.push(
						`enrichment:${context.getValue(principal)?.id ?? 'missing'}`,
					)
					return context.withValue(resolverTrace, ['credentials', 'enrichment'])
				},
			}),
		])
		const fixture = await startHttpFixture({
			handler: (request) => {
				const context = getCurrentRequest()
				return Response.json({
					authorization: request.headers.has('Authorization'),
					cookie: request.headers.has('Cookie'),
					principal: context.getValue(principal)?.id,
					trace: context.getValue(resolverTrace),
				})
			},
			resolvers: [credentials, enrichment],
		})
		const response = await fixture.http.fetch(
			serverRequest('context-app', [
				['Authorization', 'Bearer session-1'],
				['Cookie', 'sid=session-1'],
			]),
		)
		expect(await response.json()).toStrictEqual({
			authorization: false,
			cookie: false,
			principal: 'Bearer session-1',
			trace: ['credentials', 'enrichment'],
		})
		expect(observations).toStrictEqual([
			'credentials:true',
			'enrichment:Bearer session-1',
		])
		await fixture.runtime.dispose()
	})

	it('rejects a replacement anonymous context before route behavior', async () => {
		const handler = vi.fn(() => new Response('unexpected'))
		const replacement = resolverPlugin('fixture.http-replacement', [
			httpContextResolver({
				resolve: ({ context }) =>
					RequestContext.anonymous({
						requestId: context.requestId,
						signal: context.signal,
						source: context.source,
					}),
			}),
		])
		const fixture = await startHttpFixture({
			handler,
			resolvers: [replacement],
		})
		const response = await fixture.http.fetch(serverRequest('context-app'))
		expect(response.status).toBe(401)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_APPLICATION_REJECTED' },
		})
		expect(handler).not.toHaveBeenCalled()
		await fixture.runtime.dispose()
	})
})

describe('HTTP Master verification', () => {
	it('elevates only the exact header, audits once, and retains resolver values', async () => {
		const audits: MasterAccessEvent[] = []
		const logs: unknown[] = []
		let handlerContext: RequestContext | undefined
		const authority = new MasterAuthority({
			clock: () => new Date('2026-09-04T12:00:00.000Z'),
			keys: [{ id: 'primary', value: 'master-secret' }],
			onUse: (event) => {
				audits.push(event)
			},
		})
		const credentials = resolverPlugin('fixture.http-master-session', [
			httpContextResolver({
				resolve: ({ context }) =>
					context.withValue(principal, { id: 'session-principal' }),
			}),
		])
		const handler = vi.fn((request: Request) => {
			const context = getCurrentRequest()
			handlerContext = context
			return Response.json({
				keyId: context.access.mode === 'master' ? context.access.keyId : null,
				masterHeader: request.headers.has('X-UltimaBase-Master-Key'),
				mode: context.access.mode,
				principal: context.getValue(principal)?.id,
			})
		})
		const fixture = await startHttpFixture({
			handler,
			masterAuthority: authority,
			masterEnabled: true,
			pluginPrivileges: {
				logger: {
					error: (report) => {
						logs.push(report)
					},
					info: (report) => {
						logs.push(report)
					},
				},
			},
			resolvers: [credentials],
		})
		const response = await fixture.http.fetch(
			serverRequest('context-app', [
				['X-UltimaBase-Master-Key', 'master-secret'],
			]),
		)
		const body: unknown = await response.json()
		expect(body).toStrictEqual({
			keyId: 'primary',
			masterHeader: false,
			mode: 'master',
			principal: 'session-principal',
		})
		expect(audits).toStrictEqual([
			{
				keyId: 'primary',
				kind: 'master-access',
				occurredAt: '2026-09-04T12:00:00.000Z',
				previousAccess: { mode: 'anonymous' },
				reason: 'HTTP Master key verification',
				requestId: response.headers.get('X-UltimaBase-Request-Id'),
				source: 'fixture.http-context',
			},
		])
		expect(handler).toHaveBeenCalledOnce()
		expect(
			JSON.stringify({
				audits,
				body,
				capabilities: handlerContext?.capabilities,
				http: fixture.http,
				logs,
				metadata: handlerContext?.metadata,
			}),
		).not.toContain('master-secret')
		await fixture.runtime.dispose()
	})

	it('never falls back after invalid, disabled, absent, foreign, or failed audit verification', async () => {
		const handler = vi.fn(() => new Response('unexpected'))
		const foreignApplicationAuthority = new MasterAuthority({
			keys: [{ id: 'foreign-app', value: 'foreign-secret' }],
			onUse: () => undefined,
		})
		expect(foreignApplicationAuthority.authorize('foreign-secret').keyId).toBe(
			'foreign-app',
		)
		const cases = [
			{
				authority: new MasterAuthority({
					keys: [{ id: 'valid', value: 'valid-secret' }],
					onUse: () => undefined,
				}),
				enabled: true,
				key: 'invalid-secret',
			},
			{
				authority: new MasterAuthority({
					keys: [{ id: 'disabled', value: 'disabled-secret' }],
					onUse: () => undefined,
				}),
				enabled: false,
				key: 'disabled-secret',
			},
			{ authority: undefined, enabled: true, key: 'absent-secret' },
			{
				authority: new MasterAuthority({
					keys: [{ id: 'foreign', value: 'other-application-secret' }],
					onUse: () => undefined,
				}),
				enabled: true,
				key: 'foreign-secret',
			},
			{
				authority: new MasterAuthority({
					keys: [{ id: 'audit', value: 'audit-secret' }],
					onUse: () => {
						throw new Error('audit sink included a private failure')
					},
				}),
				enabled: true,
				key: 'audit-secret',
			},
		] as const

		for (const [index, testCase] of cases.entries()) {
			const fixture = await startHttpFixture({
				appId: `rejected-${String(index)}`,
				handler,
				...(testCase.authority === undefined
					? {}
					: { masterAuthority: testCase.authority }),
				masterEnabled: testCase.enabled,
			})
			const response = await fixture.http.fetch(
				serverRequest(`rejected-${String(index)}`, [
					['X-UltimaBase-Master-Key', testCase.key],
				]),
			)
			expect(response.status).toBe(401)
			expect(await response.clone().json()).toMatchObject({
				error: { code: 'HTTP_APPLICATION_REJECTED' },
			})
			expect(await response.text()).not.toContain(testCase.key)
			await fixture.runtime.dispose()
		}
		expect(handler).not.toHaveBeenCalled()
	})

	it('ignores body, query, alternate headers, and serialized authority claims', async () => {
		const authority = new MasterAuthority({
			keys: [{ id: 'canonical', value: 'canonical-secret' }],
			onUse: () => undefined,
		})
		const fixture = await startHttpFixture({
			handler: () => Response.json({ mode: getCurrentRequest().access.mode }),
			masterAuthority: authority,
			masterEnabled: true,
		})
		const forged = serverRequest(
			'context-app',
			[['X-Master-Key', 'canonical-secret']],
			{
				body: JSON.stringify({
					context: { access: { mode: 'master' } },
					grants: ['master'],
					privileges: ['authority:elevate'],
					useMasterKey: true,
				}),
				headers: { 'Content-Type': 'application/json' },
			},
		)
		const request = new Request(
			`${forged.request.url}?masterKey=canonical-secret&useMasterKey=true`,
			forged.request,
		)
		const response = await fixture.http.fetch({ ...forged, request })
		expect(await response.json()).toStrictEqual({ mode: 'anonymous' })
		await fixture.runtime.dispose()
	})

	it('requires authority:elevate before any application behavior', async () => {
		await expect(
			startHttpFixture({
				handler: () => new Response(),
				masterEnabled: true,
				pluginPrivileges: {
					deny: ['authority:elevate'],
					logger: false,
				},
			}),
		).rejects.toMatchObject({ code: 'PLUGIN_PRIVILEGE_DENIED' })
	})
})

describe('HTTP request lifetime', () => {
	it('uses one composed signal and returns the safe deadline error', async () => {
		let resolverSignal: AbortSignal | undefined
		let handlerSignal: AbortSignal | undefined
		const resolver = resolverPlugin('fixture.http-deadline', [
			httpContextResolver({
				resolve: ({ context }) => {
					resolverSignal = context.signal
					return context
				},
			}),
		])
		const fixture = await startHttpFixture({
			handler: () => {
				handlerSignal = getCurrentRequest().signal
				return new Promise((resolve) => {
					handlerSignal?.addEventListener('abort', () => {
						resolve(new Response())
					})
				})
			},
			requestTimeoutMs: 10,
			resolvers: [resolver],
		})
		const response = await fixture.http.fetch(serverRequest('context-app'))
		expect(response.status).toBe(408)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_REQUEST_TIMEOUT' },
		})
		expect(resolverSignal).toBe(handlerSignal)
		expect(handlerSignal?.aborted).toBe(true)
		await fixture.runtime.dispose()
	})

	it('isolates concurrent values and ambient request storage', async () => {
		const resolver = resolverPlugin('fixture.http-concurrent', [
			httpContextResolver({
				resolve: async ({ context, request }) => {
					const id = request.headers.get('Authorization') ?? 'missing'
					await new Promise((resolve) =>
						setTimeout(resolve, id === 'slow' ? 15 : 1),
					)
					expect(getCurrentRequest()).toBe(context)
					return context.withValue(principal, { id })
				},
			}),
		])
		const fixture = await startHttpFixture({
			handler: async () => {
				const before = getCurrentRequest()
				await Promise.resolve()
				return new Response(
					`${before.requestId}:${before.getValue(principal)?.id ?? 'missing'}:${String(getCurrentRequest() === before)}`,
				)
			},
			resolvers: [resolver],
		})
		const [slow, fast] = await Promise.all([
			fixture.http.fetch(
				serverRequest('context-app', [['Authorization', 'slow']]),
			),
			fixture.http.fetch(
				serverRequest('context-app', [['Authorization', 'fast']]),
			),
		])
		expect(await slow.text()).toBe(
			`${slow.headers.get('X-UltimaBase-Request-Id') ?? 'missing'}:slow:true`,
		)
		expect(await fast.text()).toBe(
			`${fast.headers.get('X-UltimaBase-Request-Id') ?? 'missing'}:fast:true`,
		)
		expect(slow.headers.get('X-UltimaBase-Request-Id')).not.toBe(
			fast.headers.get('X-UltimaBase-Request-Id'),
		)
		await fixture.runtime.dispose()
	})

	it('keeps request storage through deferred response-body completion', async () => {
		let releaseBody: (() => void) | undefined
		const bodyGate = new Promise<void>((resolve) => {
			releaseBody = resolve
		})
		let responseContext: RequestContext | undefined
		const fixture = await startHttpFixture({
			handler: () => {
				const requestContext = getCurrentRequest()
				return new Response(
					new ReadableStream<Uint8Array>({
						pull: async (controller) => {
							await bodyGate
							responseContext = getCurrentRequest()
							controller.enqueue(
								new TextEncoder().encode(requestContext.requestId),
							)
							controller.close()
						},
					}),
				)
			},
		})
		const response = await fixture.http.fetch(serverRequest('context-app'))
		releaseBody?.()
		expect(await response.text()).toBe(
			response.headers.get('X-UltimaBase-Request-Id'),
		)
		expect(responseContext?.requestId).toBe(
			response.headers.get('X-UltimaBase-Request-Id'),
		)
		await fixture.runtime.dispose()
	})

	it('isolates ambient contexts across application instances', async () => {
		const firstResolver = resolverPlugin('fixture.http-first-application', [
			httpContextResolver({
				resolve: ({ context }) =>
					context.withValue(principal, { id: 'first-value' }),
			}),
		])
		const secondResolver = resolverPlugin('fixture.http-second-application', [
			httpContextResolver({
				resolve: ({ context }) =>
					context.withValue(principal, { id: 'second-value' }),
			}),
		])
		const first = await startHttpFixture({
			appId: 'first-app',
			handler: () => new Response(getCurrentRequest().getValue(principal)?.id),
			resolvers: [firstResolver],
		})
		const firstResponse = await first.http.fetch(serverRequest('first-app'))
		await first.runtime.dispose()
		const second = await startHttpFixture({
			appId: 'second-app',
			handler: () => new Response(getCurrentRequest().getValue(principal)?.id),
			resolvers: [secondResolver],
		})
		const secondResponse = await second.http.fetch(serverRequest('second-app'))
		expect(await firstResponse.text()).toBe('first-value')
		expect(await secondResponse.text()).toBe('second-value')
		await Promise.all([first.runtime.dispose(), second.runtime.dispose()])
	})
})
