import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Selects the SameSite attribute of the session cookie. */
export type AuthCookieSameSite = 'lax' | 'none' | 'strict'

/** Enables the secure session cookie. */
export interface AuthCookieOptions {
	/** One host-only name beginning with the secure `__Host-` prefix. */
	readonly name: string
	/** Adds defense in depth beside the mandatory Origin proof. @default "lax" */
	readonly sameSite?: AuthCookieSameSite
}

/**
 * Configures the authentication routes: `Bearer` always, plus an optional
 * `__Host-` cookie that changes only the responses.
 */
export interface AuthHttpOptions {
	/** Prefix of every authentication route. @default "/api/auth" */
	readonly basePath?: string
	/** Sets the session in a secure cookie instead of returning its token. */
	readonly cookie?: AuthCookieOptions
}

/** The complete validated HTTP configuration. */
export interface ResolvedAuthHttpOptions {
	readonly basePath: string
	readonly cookie: ResolvedAuthCookieOptions | undefined
}

/** The complete validated cookie policy. */
export interface ResolvedAuthCookieOptions {
	readonly name: string
	readonly sameSite: AuthCookieSameSite
}

const cookieNamePattern = /^__Host-[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
const basePathPattern = /^(?:\/[a-z0-9][a-z0-9-]*)+$/u

const resolveCookie = (
	value: unknown,
): ResolvedAuthCookieOptions | undefined => {
	if (value === undefined) return undefined
	if (!isPlainRecord(value)) {
		throw new TypeError('authPlugin http.cookie must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (key !== 'name' && key !== 'sameSite') {
			throw new TypeError(
				`authPlugin http.cookie contains unknown option: ${key}`,
			)
		}
	}
	if (typeof value.name !== 'string' || !cookieNamePattern.test(value.name)) {
		throw new TypeError(
			'authPlugin http.cookie.name must be a valid __Host- cookie name',
		)
	}
	const sameSite = value.sameSite ?? 'lax'
	if (sameSite !== 'lax' && sameSite !== 'none' && sameSite !== 'strict') {
		throw new TypeError(
			'authPlugin http.cookie.sameSite must be lax, strict, or none',
		)
	}
	return immutableRecord({ name: value.name, sameSite })
}

/** Validates the `http` option. */
export const resolveAuthHttpOptions = (
	value: unknown,
): ResolvedAuthHttpOptions => {
	if (value === undefined) {
		return immutableRecord({ basePath: '/api/auth', cookie: undefined })
	}
	if (!isPlainRecord(value)) {
		throw new TypeError('authPlugin http must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (key !== 'basePath' && key !== 'cookie') {
			throw new TypeError(`authPlugin http contains unknown option: ${key}`)
		}
	}
	const basePath = value.basePath ?? '/api/auth'
	if (typeof basePath !== 'string' || !basePathPattern.test(basePath)) {
		throw new TypeError(
			'authPlugin http.basePath must be a lowercase path such as /api/auth',
		)
	}
	return immutableRecord({ basePath, cookie: resolveCookie(value.cookie) })
}
