import {
	FrameworkError,
	MasterAuthority,
	UltimaBase,
	getCurrentRequest,
} from '@ultimabase/core'
import {
	graphqlPlugin,
	type GraphqlApplication,
} from '@ultimabase/graphql-plugin'
import {
	httpApplicationIdHeader,
	httpContextResolver,
	httpMasterKeyHeader,
	httpPlugin,
	httpRequestIdHeader,
	provideHttpContextResolvers,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import {
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
} from 'graphql'
import { describe, expect, it, vi } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import {
	graphqlYogaFixtureDatabasePlugin,
	graphqlYogaFixtureHttpConsumer,
	readFixtureHttpApplication,
} from './test-application.test-support.js'
import {
	RequestContext,
	RequestContextValue,
	anonymous,
	plugin,
} from '@ultimabase/core/plugin'

const sessionPrincipal = new RequestContextValue<
	Readonly<{ readonly id: string }>
>('fixture.graphql-yoga.session-principal', (value) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('id' in value) ||
		typeof value.id !== 'string'
	) {
		throw new TypeError('GraphQL Yoga session principal must contain an ID')
	}
	return Object.freeze({ id: value.id })
})

const sessionResolverPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-session',
	version: '1.0.0',
	contributions: [
		provideHttpContextResolvers({
			contributionId: 'fixture-session',
			create: () =>
				httpContextResolver({
					resolve: ({ context, request }) => {
						const authorization = request.headers.get('Authorization')
						return authorization === null
							? context
							: context.withValue(sessionPrincipal, {
									id: authorization,
								})
					},
				}),
		}),
	],
})

const schema = new GraphQLSchema({
	query: new GraphQLObjectType<unknown, unknown>({
		name: 'Query',
		fields: {
			context: {
				type: GraphQLString,
				resolve: (_source, _arguments, context) => {
					const current = getCurrentRequest()
					const request: unknown =
						typeof context === 'object' && context !== null
							? Reflect.get(context, 'request')
							: undefined
					if (!(request instanceof RequestContext)) {
						throw new TypeError('missing real request context')
					}
					return `${current.requestId}:${current.access.mode}:${String(current === request)}`
				},
			},
			echo: {
				args: { value: { type: new GraphQLNonNull(GraphQLString) } },
				resolve: (_source, arguments_) => {
					const value: unknown = Reflect.get(arguments_, 'value')
					return typeof value === 'string' ? value : null
				},
				type: GraphQLString,
			},
			principal: {
				resolve: () => getCurrentRequest().getValue(sessionPrincipal)?.id,
				type: GraphQLString,
			},
			publicFailure: {
				resolve: () => {
					throw new FrameworkError('PERMISSION_DENIED', 'private policy', {
						publicMessage: 'Denied safely.',
					})
				},
				type: GraphQLString,
			},
			secretFailure: {
				resolve: () => {
					throw new Error('database password secret')
				},
				type: GraphQLString,
			},
			slow: {
				resolve: async () => {
					const signal = getCurrentRequest().signal
					await new Promise<never>((_resolve, reject) => {
						signal.addEventListener(
							'abort',
							() => {
								reject(new Error('request aborted'))
							},
							{ once: true },
						)
					})
				},
				type: GraphQLString,
			},
		},
	}),
})

const createFixture = async (
	options: Parameters<typeof graphqlYogaPlugin>[0] = {},
	master = false,
	requestTimeoutMs?: number,
) => {
	const ultimabase = new (UltimaBase.use(
		graphqlYogaFixtureDatabasePlugin,
		httpPlugin({
			appId: 'notes',
			...(master ? { master: true as const } : {}),
			...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
		}),
		sessionResolverPlugin,
		graphqlPlugin({
			publicWrites: true,
			default: false,
			schemas: [schema],
		}),
		graphqlYogaPlugin(options),
		graphqlYogaFixtureHttpConsumer,
	))({
		...(master
			? {
					masterAuthority: new MasterAuthority({
						keys: [{ id: 'test-master', value: 'master-secret' }],
						onUse: () => undefined,
					}),
				}
			: {}),
		logger: false,
		schemas: [],
	})
	await ultimabase.start()
	return {
		http: readFixtureHttpApplication(ultimabase),
		ultimabase,
	}
}

const request = async (
	http: HttpApplication,
	input: Readonly<{
		readonly accept?: string
		readonly authorization?: string
		readonly body?: string
		readonly contentLength?: boolean
		readonly contentType?: string
		readonly masterKey?: string
		readonly method?: string
		readonly path?: string
		readonly requestId?: string
		readonly signal?: AbortSignal
	}>,
): Promise<Response> => {
	const headers = new Headers()
	if (input.accept !== undefined) headers.set('Accept', input.accept)
	if (input.contentType !== undefined) {
		headers.set('Content-Type', input.contentType)
	}
	if (input.contentLength === true && input.body !== undefined) {
		headers.set(
			'Content-Length',
			String(new TextEncoder().encode(input.body).byteLength),
		)
	}
	if (input.authorization !== undefined) {
		headers.set('Authorization', input.authorization)
	}
	if (input.masterKey !== undefined) {
		headers.set(httpMasterKeyHeader, input.masterKey)
	}
	const originalHeaders: HttpOriginalHeader[] = [
		[httpApplicationIdHeader, 'notes'],
	]
	if (input.requestId !== undefined) {
		originalHeaders.push([httpRequestIdHeader, input.requestId])
	}
	if (input.authorization !== undefined) {
		originalHeaders.push(['Authorization', input.authorization])
	}
	if (input.masterKey !== undefined) {
		originalHeaders.push([httpMasterKeyHeader, input.masterKey])
	}
	return await http.fetch({
		originalHeaders,
		request: new Request(`http://localhost${input.path ?? '/graphql'}`, {
			...(input.body === undefined ? {} : { body: input.body }),
			headers,
			method: input.method ?? 'POST',
			...(input.signal === undefined ? {} : { signal: input.signal }),
		}),
	})
}

const json = async (response: Response): Promise<unknown> =>
	await response.json()

describe('GraphQL Yoga HTTP adapter', () => {
	it('matches networkless execution with the exact HTTP request context', async () => {
		const fixture = await createFixture()
		const response = await request(fixture.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json; charset=utf-8',
			requestId: 'http-context',
		})
		expect(response.status, await response.clone().text()).toBe(200)
		expect(response.headers.get('content-type')).toBe(
			'application/graphql-response+json; charset=utf-8',
		)
		expect(response.headers.get('cache-control')).toContain('no-store')
		expect(await json(response)).toEqual({
			data: { context: 'http-context:anonymous:true' },
		})

		const graphql = fixture.ultimabase.plugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const context = anonymous(fixture.ultimabase, {
			requestId: 'networkless-context',
			source: 'test',
		}).context
		await expect(
			graphql.execute({ context, document: '{ context }' }),
		).resolves.toEqual({
			data: { context: 'networkless-context:anonymous:true' },
		})
		await fixture.ultimabase.dispose()
	})

	it('mounts an exact custom path after HTTP application selection', async () => {
		const fixture = await createFixture({ path: '/api/graphql' })
		const accepted = await request(fixture.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
			path: '/api/graphql',
		})
		expect(accepted.status).toBe(200)
		const nested = await request(fixture.http, {
			accept: 'text/event-stream',
			body: '{}',
			contentType: 'application/json',
			path: '/api/graphql/nested',
		})
		expect(nested.status).toBe(404)

		const preDispatch = await fixture.http.fetch({
			originalHeaders: [[httpApplicationIdHeader, 'other']],
			request: new Request('http://localhost/api/graphql', {
				body: JSON.stringify({ query: '{ context }' }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			}),
		})
		expect(preDispatch.status).toBe(404)
		expect(await json(preDispatch)).toMatchObject({
			error: { code: 'HTTP_APPLICATION_UNKNOWN' },
		})
		await fixture.ultimabase.dispose()
	})

	it('negotiates response media and rejects unsupported methods and bodies', async () => {
		const fixture = await createFixture({ bodyLimit: 64 })
		const legacy = await request(fixture.http, {
			accept: 'application/json',
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
		})
		expect(legacy.status).toBe(200)
		expect(legacy.headers.get('content-type')).toBe(
			'application/json; charset=utf-8',
		)

		const preferred = await request(fixture.http, {
			accept: 'application/json;q=0.8, application/graphql-response+json;q=0.8',
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
		})
		expect(preferred.headers.get('content-type')).toBe(
			'application/graphql-response+json; charset=utf-8',
		)

		const method = await request(fixture.http, {
			accept: 'text/event-stream',
			method: 'GET',
		})
		expect(method.status).toBe(405)
		expect(method.headers.get('allow')).toBe('POST')
		expect(await json(method)).toMatchObject({
			errors: [{ extensions: { code: 'METHOD_NOT_ALLOWED' } }],
		})

		const unacceptable = await request(fixture.http, {
			accept: 'text/event-stream',
			body: '{}',
			contentType: 'application/json',
		})
		expect(unacceptable.status).toBe(406)

		const unsupported = await request(fixture.http, {
			body: '{}',
			contentType: 'multipart/form-data',
		})
		expect(unsupported.status).toBe(415)
		const nonUtf8 = await request(fixture.http, {
			body: '{}',
			contentType: 'application/json; charset=utf-16',
		})
		expect(nonUtf8.status).toBe(415)

		const oversized = await request(fixture.http, {
			body: JSON.stringify({ query: `{ echo(value: "${'x'.repeat(80)}") }` }),
			contentType: 'application/json',
		})
		// ADR-0323: HTTP enforces the GraphQL limit while the body streams.
		expect(oversized.status).toBe(413)
		expect(await json(oversized)).toMatchObject({
			error: { code: 'HTTP_PAYLOAD_TOO_LARGE' },
		})
		const declared = await request(fixture.http, {
			body: JSON.stringify({ query: `{ echo(value: "${'x'.repeat(80)}") }` }),
			contentLength: true,
			contentType: 'application/json',
		})
		// A declared Content-Length is still refused by GraphQL in its own format.
		expect(declared.status).toBe(413)
		expect(await json(declared)).toMatchObject({
			errors: [{ extensions: { code: 'PAYLOAD_TOO_LARGE' } }],
		})
		await fixture.ultimabase.dispose()
	})

	it.each([
		['invalid JSON', '{', 'BAD_REQUEST'],
		['batch array', '[{"query":"{ context }"}]', 'BAD_REQUEST'],
		['unknown field', '{"query":"{ context }","extra":true}', 'BAD_REQUEST'],
		[
			'non-object variables',
			'{"query":"{ context }","variables":[]}',
			'BAD_REQUEST',
		],
		[
			'empty operation name',
			'{"query":"{ context }","operationName":""}',
			'BAD_REQUEST',
		],
		[
			'non-empty extensions',
			'{"query":"{ context }","extensions":{"persisted":true}}',
			'BAD_REQUEST',
		],
	])('rejects malformed %s requests', async (_name, body, code) => {
		const fixture = await createFixture()
		const response = await request(fixture.http, {
			body,
			contentType: 'application/json',
			requestId: 'bad-request',
		})
		expect(response.status).toBe(400)
		expect(await json(response)).toMatchObject({
			errors: [
				{
					extensions: { code, requestId: 'bad-request', retryable: false },
				},
			],
		})
		await fixture.ultimabase.dispose()
	})

	it('uses 400 for GraphQL request errors and 200 for safe resolver errors', async () => {
		const fixture = await createFixture()
		const syntax = await request(fixture.http, {
			body: JSON.stringify({ query: '{' }),
			contentType: 'application/json',
			requestId: 'syntax',
		})
		expect(syntax.status).toBe(400)
		const syntaxBody = await json(syntax)
		expect(syntaxBody).toMatchObject({
			errors: [
				{ extensions: { code: 'GRAPHQL_PARSE_FAILED', requestId: 'syntax' } },
			],
		})
		expect(JSON.stringify(syntaxBody)).not.toContain('"http"')

		const variable = await request(fixture.http, {
			body: JSON.stringify({
				operationName: 'Echo',
				query: 'query Echo($value: String!) { echo(value: $value) }',
				variables: {},
			}),
			contentType: 'application/json',
			requestId: 'variable',
		})
		expect(variable.status).toBe(400)

		const publicFailure = await request(fixture.http, {
			body: JSON.stringify({ query: '{ publicFailure }' }),
			contentType: 'application/json',
			requestId: 'public-failure',
		})
		expect(publicFailure.status).toBe(200)
		expect(await json(publicFailure)).toMatchObject({
			data: { publicFailure: null },
			errors: [
				{
					extensions: {
						code: 'PERMISSION_DENIED',
						requestId: 'public-failure',
					},
					message: 'Denied safely.',
				},
			],
		})

		const secretFailure = await request(fixture.http, {
			body: JSON.stringify({ query: '{ secretFailure }' }),
			contentType: 'application/json',
			requestId: 'secret-failure',
		})
		expect(secretFailure.status).toBe(200)
		const secretBody = JSON.stringify(await json(secretFailure))
		expect(secretBody).toContain('Unexpected error.')
		expect(secretBody).not.toContain('database password secret')
		await fixture.ultimabase.dispose()
	})

	// ADR-0312: introspection is on in development and off in production; an
	// explicit value wins in both.
	it('disables HTTP introspection by default in production and enables it explicitly', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const disabled = await createFixture()
		const denied = await request(disabled.http, {
			body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
			contentType: 'application/json',
		})
		expect(denied.status).toBe(400)
		await disabled.ultimabase.dispose()

		const enabled = await createFixture({ introspection: true })
		const accepted = await request(enabled.http, {
			body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
			contentType: 'application/json',
		})
		expect(accepted.status).toBe(200)
		expect(await json(accepted)).toEqual({
			data: { __schema: { queryType: { name: 'Query' } } },
		})
		await enabled.ultimabase.dispose()

		vi.stubEnv('NODE_ENV', undefined)
		const development = await createFixture()
		const allowed = await request(development.http, {
			body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
			contentType: 'application/json',
		})
		expect(allowed.status).toBe(200)
		await development.ultimabase.dispose()

		const explicit = await createFixture({ introspection: false })
		const refused = await request(explicit.http, {
			body: JSON.stringify({ query: '{ __schema { queryType { name } } }' }),
			contentType: 'application/json',
		})
		expect(refused.status).toBe(400)
		await explicit.ultimabase.dispose()
		vi.unstubAllEnvs()
	})

	it('inherits audited Master authority without exposing its raw header', async () => {
		const fixture = await createFixture({}, true)
		const response = await request(fixture.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
			masterKey: 'master-secret',
			requestId: 'master',
		})
		expect(response.status).toBe(200)
		expect(await json(response)).toEqual({
			data: { context: 'master:master:true' },
		})
		await fixture.ultimabase.dispose()
	})

	it('inherits session context while credentials remain outside GraphQL', async () => {
		const fixture = await createFixture()
		const response = await request(fixture.http, {
			authorization: 'Bearer session-1',
			body: JSON.stringify({ query: '{ principal }' }),
			contentType: 'application/json',
			requestId: 'session',
		})
		expect(response.status).toBe(200)
		expect(await json(response)).toEqual({
			data: { principal: 'Bearer session-1' },
		})

		const graphql = fixture.ultimabase.plugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const directContext = anonymous(fixture.ultimabase, {
			requestId: 'direct-session',
			source: 'test',
		}).context.withValue(sessionPrincipal, { id: 'Bearer session-1' })
		await expect(
			graphql.execute({ context: directContext, document: '{ principal }' }),
		).resolves.toEqual({ data: { principal: 'Bearer session-1' } })
		await fixture.ultimabase.dispose()
	})

	it('propagates client aborts and converts application deadlines upstream', async () => {
		const deadlineFixture = await createFixture({}, false, 10)
		const timedOut = await request(deadlineFixture.http, {
			body: JSON.stringify({ query: '{ slow }' }),
			contentType: 'application/json',
		})
		expect(timedOut.status).toBe(408)
		expect(await json(timedOut)).toMatchObject({
			error: { code: 'HTTP_REQUEST_TIMEOUT' },
		})
		await deadlineFixture.ultimabase.dispose()

		const abortedFixture = await createFixture()
		const controller = new AbortController()
		const pending = request(abortedFixture.http, {
			body: JSON.stringify({ query: '{ slow }' }),
			contentType: 'application/json',
			signal: controller.signal,
		})
		controller.abort(new Error('client disconnected'))
		await expect(pending).rejects.toThrow('Operation execution was cancelled.')
		await abortedFixture.ultimabase.dispose()
	})

	it('rejects stale use after teardown and permits a fresh application', async () => {
		const fixture = await createFixture()
		const active = await request(fixture.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
		})
		expect(active.status).toBe(200)
		await fixture.ultimabase.dispose()
		const stale = await request(fixture.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
		})
		expect(stale.status).toBe(500)

		const fresh = await createFixture()
		const recreated = await request(fresh.http, {
			body: JSON.stringify({ query: '{ context }' }),
			contentType: 'application/json',
		})
		expect(recreated.status).toBe(200)
		await fresh.ultimabase.dispose()
	})
})
