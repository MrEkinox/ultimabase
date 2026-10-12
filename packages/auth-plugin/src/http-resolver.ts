import type { Pointer } from '@ultimabase/core'
import type { CapabilityProviderDeclaration } from '@ultimabase/core/plugin'
import {
	httpApplicationIdHeader,
	httpContextResolver,
	provideHttpContextResolvers,
	type EnabledHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type httpContextResolverContributionsCapability,
} from '@ultimabase/http-plugin'

import { rejectSession } from './errors.js'
import type { ResolvedAuthHttpOptions } from './http-options.js'
import { createAuthPrincipal } from './principal.js'
import {
	authClient,
	authPrincipal,
	authSession,
	isSessionToken,
	type AuthSession,
} from './session.js'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const userAgentLength = 256

/** The route paths the resolver must know, below the configured prefix. */
export interface AuthHttpResolverPaths {
	/** Every authentication route. */
	readonly routes: ReadonlySet<string>
	/** Sign-up and login: a stale cookie never blocks them. */
	readonly signIn: ReadonlySet<string>
}

/**
 * Returns every value of the named cookie, or `undefined` when it is absent.
 * A bare name without `=` still counts as present so it cannot be ignored.
 */
const readCookieValues = (
	header: string | null,
	name: string,
): readonly string[] | undefined => {
	if (header === null) return undefined
	let values: string[] | undefined
	for (const rawPart of header.split(';')) {
		const part = rawPart.trim()
		const separator = part.indexOf('=')
		if (separator < 0) {
			if (part === name) values ??= []
			continue
		}
		if (part.slice(0, separator).trim() !== name) continue
		values ??= []
		values.push(part.slice(separator + 1).trim())
	}
	return values
}

const readBearerCredential = (header: string): string => {
	if (!header.startsWith('Bearer ')) return rejectSession()
	const token = header.slice('Bearer '.length)
	if (!isSessionToken(token)) return rejectSession()
	return token
}

const includesHeader = (
	policy: EnabledHttpBrowserPolicy,
	name: string,
): boolean =>
	policy.allowedHeaders.some(
		(header) => header.toLowerCase() === name.toLowerCase(),
	)

const assertCookieBrowserPolicy = (
	policy: HttpBrowserPolicy,
): EnabledHttpBrowserPolicy => {
	if (
		!policy.enabled ||
		policy.origins === '*' ||
		!policy.credentials ||
		!policy.allowedMethods.includes('POST') ||
		!includesHeader(policy, httpApplicationIdHeader) ||
		!includesHeader(policy, 'Content-Type')
	) {
		throw new TypeError(
			'authPlugin cookie mode requires credentialed exact origins with POST, Content-Type, and application-ID browser policy',
		)
	}
	return policy
}

const assertCookieRequestProof = (
	request: Request,
	policy: EnabledHttpBrowserPolicy,
): void => {
	const origin = request.headers.get('Origin')
	if (
		request.headers.get('Content-Type') !== 'application/json' ||
		origin === null ||
		origin === 'null' ||
		policy.origins === '*' ||
		!policy.origins.includes(origin)
	) {
		return rejectSession()
	}
}

/** Resolves sessions from `Bearer` or the cookie, and records the client. */
export const provideAuthHttpResolver = (options: {
	readonly http: ResolvedAuthHttpOptions
	readonly paths: AuthHttpResolverPaths
	/** Validates one raw token and returns its session and User pointer. */
	readonly validate: (
		token: string,
	) => Promise<
		| Readonly<{ readonly context: AuthSession; readonly user: Pointer }>
		| undefined
	>
}): CapabilityProviderDeclaration<
	typeof httpContextResolverContributionsCapability
> => {
	const { cookie } = options.http
	return provideHttpContextResolvers({
		contributionId: 'auth-session',
		create: () =>
			httpContextResolver({
				...(cookie === undefined
					? {}
					: {
							validateBrowserPolicy: (policy: HttpBrowserPolicy) => {
								assertCookieBrowserPolicy(policy)
							},
						}),
				resolve: async ({
					browserPolicy: effectiveBrowserPolicy,
					clientAddress,
					context,
					request,
				}) => {
					const browserPolicy =
						cookie === undefined
							? undefined
							: assertCookieBrowserPolicy(effectiveBrowserPolicy)
					const path = new URL(request.url).pathname
					const authorization = request.headers.get('Authorization')
					const cookieValues =
						cookie === undefined
							? undefined
							: readCookieValues(request.headers.get('Cookie'), cookie.name)
					// Bearer plus the configured cookie is always ambiguous.
					if (authorization !== null && cookieValues !== undefined) {
						return rejectSession()
					}
					let token: string | undefined
					let usesCookie = false
					if (authorization !== null) {
						token = readBearerCredential(authorization)
					} else if (
						cookieValues !== undefined &&
						// A stale cookie must never block credential recovery.
						!options.paths.signIn.has(path)
					) {
						const [value] = cookieValues
						if (cookieValues.length !== 1 || !isSessionToken(value)) {
							return rejectSession()
						}
						token = value
						usesCookie = true
					}
					if (
						browserPolicy !== undefined &&
						(options.paths.routes.has(path) ||
							(usesCookie && !safeMethods.has(request.method)))
					) {
						assertCookieRequestProof(request, browserPolicy)
					}
					const client = context.withValue(authClient, {
						address: clientAddress,
						userAgent:
							request.headers.get('User-Agent')?.slice(0, userAgentLength) ??
							null,
					})
					if (token === undefined) return client
					const validated = await options.validate(token)
					if (validated === undefined) return rejectSession()
					return client
						.withValue(authPrincipal, createAuthPrincipal(validated.user))
						.withValue(authSession, validated.context)
				},
			}),
	})
}
