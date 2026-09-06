import {
	httpApplicationIdHeader,
	httpContextResolver,
	provideHttpContextResolvers,
	type EnabledHttpBrowserPolicy,
	type HttpBrowserPolicy,
	type httpContextResolverContributionsCapability,
} from '@ultimabase/http-plugin'
import { type CapabilityProviderDeclaration } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { ResolvedPasswordAuthCookieOptions } from './http-options.js'
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
import type { PasswordUserDefinition } from './user-schema.js'

/** Names the four Password Auth-owned secure-cookie routes. */
export const passwordAuthCookiePaths: Readonly<{
	readonly login: '/auth/v1/login'
	readonly logout: '/auth/v1/logout'
	readonly refresh: '/auth/v1/refresh'
	readonly signUp: '/auth/v1/sign-up'
}> = immutableRecord({
	login: '/auth/v1/login',
	logout: '/auth/v1/logout',
	refresh: '/auth/v1/refresh',
	signUp: '/auth/v1/sign-up',
} as const)

const cookieRoutePaths = new Set<string>(Object.values(passwordAuthCookiePaths))
const credentialIssuancePaths = new Set<string>([
	passwordAuthCookiePaths.login,
	passwordAuthCookiePaths.signUp,
])
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

interface CookieCredential {
	readonly present: boolean
	readonly values: readonly string[]
}

const readCookieCredential = (
	header: string | null,
	name: string,
): CookieCredential => {
	if (header === null) return immutableRecord({ present: false, values: [] })
	const values: string[] = []
	let present = false
	for (const rawPart of header.split(';')) {
		const part = rawPart.trim()
		const separator = part.indexOf('=')
		if (separator < 0) {
			if (part === name) present = true
			continue
		}
		if (part.slice(0, separator).trim() !== name) continue
		present = true
		values.push(part.slice(separator + 1).trim())
	}
	return immutableRecord({ present, values: Object.freeze(values) })
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
		policy.allowedOrigins === '*' ||
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
		policy.allowedOrigins === '*' ||
		!policy.allowedOrigins.includes(origin)
	) {
		return rejectPasswordSession()
	}
}

/** Provides the default Bearer resolver and optional strict cookie resolution. */
export const providePasswordHttpSessionResolver = (options: {
	readonly cookie: ResolvedPasswordAuthCookieOptions | undefined
	readonly sessions: PasswordSessionCollection
	readonly user: PasswordUserDefinition
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
					const cookieCredential =
						options.cookie === undefined
							? immutableRecord({ present: false, values: [] })
							: readCookieCredential(
									request.headers.get('Cookie'),
									options.cookie.name,
								)
					if (authorization !== null && cookieCredential.present) {
						return rejectPasswordSession()
					}

					let token: string | undefined
					let usesCookieCredential = false
					if (authorization !== null) {
						token = readBearerCredential(authorization)
					} else if (
						cookieCredential.present &&
						!credentialIssuancePaths.has(path)
					) {
						if (
							cookieCredential.values.length !== 1 ||
							!isPasswordSessionToken(cookieCredential.values[0])
						) {
							return rejectPasswordSession()
						}
						token = cookieCredential.values[0]
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
