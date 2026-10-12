import {
	PluginError,
	defineOperationTransport,
	getCurrentRequest,
	operationTransportBinding,
	operationWireCodec,
	type ApplicationOperationTransport,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import {
	contributeOperationBinding,
	type CapabilityProviderDeclaration,
	type PluginOperationBindingContribution,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { httpRoute, provideHttpEndpoints } from '@ultimabase/http-plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { authErrorCodes } from './errors.js'
import { readAuthJsonBody } from './http-json-body.js'
import type {
	ResolvedAuthCookieOptions,
	ResolvedAuthHttpOptions,
} from './http-options.js'
import type { AuthHttpResolverPaths } from './http-resolver.js'

/**
 * One authentication route below the prefix, declared by the foundation or a
 * method. `body: 'json'` reads the input from the JSON body (`null` input
 * otherwise); `response: 'session'` issues a session (its token, or the
 * cookie), `'clear'` ends the cookie session, `'result'` returns the result.
 */
export interface AuthHttpRoute {
	/**
	 * The route never reads the session, such as a token redemption: a stale
	 * session cookie never blocks it.
	 */
	readonly anonymous?: true
	readonly body: 'json' | 'none'
	readonly operation: PluginOperationDefinition
	/** The path below the prefix, such as `login`. */
	readonly path: string
	readonly response: 'clear' | 'result' | 'session'
}

const authHttpProtocol = defineOperationTransport({
	name: 'ultimabase.auth.http',
	version: '1.0.0',
})
const authHttpEndpointProtocol = immutableRecord({
	name: authHttpProtocol.name,
	version: authHttpProtocol.version,
})

const sameSiteAttributes = immutableRecord({
	lax: 'Lax',
	none: 'None',
	strict: 'Strict',
} as const)

const sessionCookie = (
	cookie: ResolvedAuthCookieOptions,
	token: string,
	expiresAt: string,
): string =>
	`${cookie.name}=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=${sameSiteAttributes[cookie.sameSite]}`

const expiredCookie = (cookie: ResolvedAuthCookieOptions): string =>
	`${cookie.name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=${sameSiteAttributes[cookie.sameSite]}`

/**
 * A sign-in route issues a session from a JSON body (sign-up and login); an
 * anonymous route recovers credentials: neither reads a stale cookie.
 */
const isSignInRoute = (route: AuthHttpRoute): boolean =>
	route.anonymous === true ||
	(route.response === 'session' && route.body === 'json')

/** Maps declared failures to their status and hides every other error. */
const errorResponse = (
	error: unknown,
	statuses: ReadonlyMap<string, number>,
): Response => {
	const requestId = getCurrentRequest().requestId
	const code: unknown = error instanceof PluginError ? error.code : undefined
	const status = typeof code === 'string' ? statuses.get(code) : undefined
	if (error instanceof PluginError && status !== undefined) {
		const payload = error.toJSON()
		const retryAfter: unknown = isPlainRecord(payload.details)
			? payload.details.retryAfterSeconds
			: undefined
		return Response.json(
			{ error: { ...payload, requestId } },
			{
				status,
				...(error.code === authErrorCodes.tooManyAttempts &&
				typeof retryAfter === 'number'
					? { headers: { 'Retry-After': String(retryAfter) } }
					: {}),
			},
		)
	}
	return Response.json(
		{
			error: {
				code: 'AUTH_INTERNAL_ERROR',
				message: 'The authentication request could not be completed.',
				requestId,
				retryable: false,
			},
		},
		{ status: 500 },
	)
}

const invalidRequest = (): Response =>
	Response.json(
		{
			error: {
				code: 'AUTH_INVALID_REQUEST',
				message: 'The request body is invalid.',
				requestId: getCurrentRequest().requestId,
				retryable: false,
			},
		},
		{ status: 400 },
	)

/** The session part of a sign-in result, with or without its token. */
const sessionBody = (value: unknown, withToken: boolean): unknown => {
	if (!isPlainRecord(value) || !isPlainRecord(value.session)) {
		throw new TypeError('Authentication result has no session')
	}
	const { absoluteExpiresAt, expiresAt, id, token } = value.session
	return immutableRecord({
		session: immutableRecord({
			absoluteExpiresAt,
			expiresAt,
			id,
			...(withToken ? { token } : {}),
		}),
		user: value.user,
	})
}

const respond = (
	route: AuthHttpRoute,
	result: unknown,
	cookie: ResolvedAuthCookieOptions | undefined,
): Response => {
	if (route.response === 'session') {
		if (cookie === undefined) {
			return Response.json({ result: sessionBody(result, true) })
		}
		const session: unknown = isPlainRecord(result) ? result.session : undefined
		if (
			!isPlainRecord(session) ||
			typeof session.token !== 'string' ||
			typeof session.expiresAt !== 'string'
		) {
			throw new TypeError('Authentication result has no session token')
		}
		// The raw token travels only in the cookie, never in the JSON body.
		return Response.json(
			{ result: sessionBody(result, false) },
			{
				headers: {
					'Set-Cookie': sessionCookie(cookie, session.token, session.expiresAt),
				},
			},
		)
	}
	if (route.response === 'clear' && cookie !== undefined) {
		return Response.json(
			{ result },
			{ headers: { 'Set-Cookie': expiredCookie(cookie) } },
		)
	}
	return Response.json({ result })
}

/** The routes, bindings and late executor binding of the HTTP transport. */
export interface AuthHttpTransport {
	readonly bindings: readonly PluginOperationBindingContribution[]
	readonly endpoints: CapabilityProviderDeclaration
	readonly paths: AuthHttpResolverPaths
	start(executor: ApplicationRequestExecutor): void
}

/** Builds one route per operation under one prefix, for Bearer and cookie alike. */
export const createAuthHttpTransport = (
	http: ResolvedAuthHttpOptions,
	routes: readonly AuthHttpRoute[],
	statuses: ReadonlyMap<string, number>,
): AuthHttpTransport => {
	const fullPath = (route: AuthHttpRoute): string =>
		`${http.basePath}/${route.path}`
	let transport: ApplicationOperationTransport | undefined
	const handle = async (route: AuthHttpRoute, request: Request) => {
		try {
			if (transport === undefined) {
				throw new TypeError('Auth HTTP operation executor is unavailable')
			}
			let input: unknown = null
			if (route.body === 'json') {
				try {
					input = route.operation.input.snapshot(
						await readAuthJsonBody(request),
						`${route.operation.name}.http-input`,
					)
				} catch {
					// A malformed or oversized body never reaches the operation.
					return invalidRequest()
				}
			}
			const result = await transport.execute({
				context: getCurrentRequest(),
				input,
				operation: route.operation.name,
				version: route.operation.version,
			})
			// The cookie answers browsers (they send `Origin`); other clients
			// keep the token, so Bearer stays usable in cookie mode.
			return respond(
				route,
				result,
				request.headers.has('Origin') ? http.cookie : undefined,
			)
		} catch (error: unknown) {
			return errorResponse(error, statuses)
		}
	}
	return immutableRecord({
		bindings: immutableArray(
			routes.map(({ operation }) =>
				contributeOperationBinding(
					operationTransportBinding({
						codec: operationWireCodec({
							decode: (value) =>
								operation.input.snapshot(value, 'auth-http.input'),
							encode: (value) => value,
							operation,
							transport: authHttpProtocol,
						}),
						metadata: immutableRecord({}),
						operation,
					}),
				),
			),
		),
		endpoints: provideHttpEndpoints({
			contributionId: 'auth-routes',
			create: () =>
				immutableArray(
					routes.map((route) =>
						httpRoute({
							handle: (request) => handle(route, request),
							method: 'POST',
							path: fullPath(route),
							protocol: authHttpEndpointProtocol,
						}),
					),
				),
		}),
		paths: immutableRecord({
			routes: new Set(routes.map(fullPath)),
			signIn: new Set(routes.filter(isSignInRoute).map(fullPath)),
		}),
		// One plugin instance serves each application it is started in, one at
		// a time (one initialized application per realm): the latest binds.
		start: (executor: ApplicationRequestExecutor) => {
			transport = executor.exposeOperations({
				operations: routes.map(({ operation }) => operation),
				transport: authHttpProtocol,
			})
		},
	})
}
