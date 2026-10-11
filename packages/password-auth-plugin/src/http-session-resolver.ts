import {
	httpApplicationIdHeader,
	httpContextResolver,
	provideHttpContextResolvers,
	type EnabledHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type httpContextResolverContributionsCapability,
} from '@ultimabase/http-plugin'
import type { CapabilityProviderDeclaration } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import type { ResolvedPasswordAuthCookieOptions } from './http-options.js'
import type { PasswordCredentialCollection } from './credentials.js'
import { rejectPasswordSession } from './operations.js'
import { createPasswordPrincipal } from './principal.js'
import {
	isPasswordSessionToken,
	passwordPrincipal,
	passwordSession,
} from './session.js'
import {
	validatePasswordSessionToken,
	type PasswordSessionCollection,
} from './sessions.js'
import type { PasswordUserReference } from './user-schema.js'

/** Names the six Password Auth-owned secure-cookie routes. */
export const passwordAuthCookiePaths: Readonly<{
	readonly changePassword: '/auth/v1/change-password'
	readonly login: '/auth/v1/login'
	readonly logout: '/auth/v1/logout'
	readonly logoutEverywhere: '/auth/v1/logout-everywhere'
	readonly refresh: '/auth/v1/refresh'
	readonly signUp: '/auth/v1/sign-up'
}> = immutableRecord({
	changePassword: '/auth/v1/change-password',
	login: '/auth/v1/login',
	logout: '/auth/v1/logout',
	logoutEverywhere: '/auth/v1/logout-everywhere',
	refresh: '/auth/v1/refresh',
	signUp: '/auth/v1/sign-up',
} as const)

const cookieRoutePaths = new Set<string>(Object.values(passwordAuthCookiePaths))
const credentialIssuancePaths = new Set<string>([
	passwordAuthCookiePaths.login,
	passwordAuthCookiePaths.signUp,
])
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

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
	if (!header.startsWith('Bearer ')) return rejectPasswordSession()
	const token = header.slice('Bearer '.length)
	if (!isPasswordSessionToken(token)) return rejectPasswordSession()
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
			'Password Auth cookie mode requires credentialed exact origins with POST, Content-Type, and application-ID browser policy',
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
		return rejectPasswordSession()
	}
}

/** Provides the default Bearer resolver and optional strict cookie resolution. */
export const providePasswordHttpSessionResolver = (options: {
	readonly cookie: ResolvedPasswordAuthCookieOptions | undefined
	readonly credentials: PasswordCredentialCollection
	readonly sessions: PasswordSessionCollection
	readonly user: PasswordUserReference
}): CapabilityProviderDeclaration<
	typeof httpContextResolverContributionsCapability
> =>
	provideHttpContextResolvers({
		contributionId: 'password-session',
		create: () =>
			httpContextResolver({
				...(options.cookie === undefined
					? {}
					: {
							validateBrowserPolicy: (policy: HttpBrowserPolicy) => {
								assertCookieBrowserPolicy(policy)
							},
						}),
				resolve: async ({
					browserPolicy: effectiveBrowserPolicy,
					context,
					request,
				}) => {
					const browserPolicy =
						options.cookie === undefined
							? undefined
							: assertCookieBrowserPolicy(effectiveBrowserPolicy)
					const path = new URL(request.url).pathname
					const authorization = request.headers.get('Authorization')
					const cookieValues =
						options.cookie === undefined
							? undefined
							: readCookieValues(
									request.headers.get('Cookie'),
									options.cookie.name,
								)
					// Bearer plus the configured cookie is always ambiguous.
					if (authorization !== null && cookieValues !== undefined) {
						return rejectPasswordSession()
					}

					let token: string | undefined
					let usesCookieCredential = false
					if (authorization !== null) {
						token = readBearerCredential(authorization)
					} else if (
						cookieValues !== undefined &&
						// A stale cookie must never block credential recovery.
						!credentialIssuancePaths.has(path)
					) {
						const [value] = cookieValues
						if (cookieValues.length !== 1 || !isPasswordSessionToken(value)) {
							return rejectPasswordSession()
						}
						token = value
						usesCookieCredential = true
					}

					if (
						browserPolicy !== undefined &&
						(cookieRoutePaths.has(path) ||
							(usesCookieCredential && !safeMethods.has(request.method)))
					) {
						assertCookieRequestProof(request, browserPolicy)
					}
					if (token === undefined) return context
					const validated = await validatePasswordSessionToken(
						options.sessions,
						options.credentials,
						token,
					)
					if (validated === undefined) return rejectPasswordSession()
					return context
						.withValue(
							passwordPrincipal,
							createPasswordPrincipal(options.user.pointer(validated.userId)),
						)
						.withValue(passwordSession, validated.context)
				},
			}),
	})
