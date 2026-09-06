import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Selects the fixed SameSite attribute of the secure session cookie. */
export type PasswordAuthCookieSameSite = 'lax' | 'none' | 'strict'

/** Enables the explicit secure Password Auth cookie transport. */
export interface PasswordAuthCookieOptions {
	/** Uses one explicit host-only name beginning with the secure `__Host-` prefix. */
	readonly name: string
	/** Adds defense in depth beside the mandatory Origin proof. @default "lax" */
	readonly sameSite?: PasswordAuthCookieSameSite
}

/** Enables Password Auth-owned HTTP routes beside the default Bearer resolver. */
export interface PasswordAuthHttpOptions {
	readonly cookie: PasswordAuthCookieOptions
}

/** Carries the complete immutable cookie policy used by request-time code. */
export interface ResolvedPasswordAuthCookieOptions {
	readonly name: string
	readonly sameSite: PasswordAuthCookieSameSite
}

const cookieNamePattern = /^__Host-[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u

/** Validates the exact opt-in HTTP cookie configuration. */
export const resolvePasswordAuthHttpOptions = (
	value: PasswordAuthHttpOptions | undefined,
): ResolvedPasswordAuthCookieOptions | undefined => {
	if (value === undefined) return undefined
	if (
		!isPlainRecord(value) ||
		Reflect.ownKeys(value).length !== 1 ||
		!isPlainRecord(value.cookie)
	) {
		throw new TypeError(
			'passwordAuthPlugin http must contain exactly one cookie object',
		)
	}
	for (const key of Reflect.ownKeys(value.cookie)) {
		if (key !== 'name' && key !== 'sameSite') {
			throw new TypeError(
				`passwordAuthPlugin http.cookie contains unknown option: ${String(key)}`,
			)
		}
	}
	if (
		typeof value.cookie.name !== 'string' ||
		!cookieNamePattern.test(value.cookie.name)
	) {
		throw new TypeError(
			'passwordAuthPlugin http.cookie.name must be a valid __Host- cookie name',
		)
	}
	const untrustedSameSite: unknown = value.cookie.sameSite
	const sameSite = untrustedSameSite ?? 'lax'
	if (sameSite !== 'lax' && sameSite !== 'none' && sameSite !== 'strict') {
		throw new TypeError(
			'passwordAuthPlugin http.cookie.sameSite must be lax, strict, or none',
		)
	}
	return immutableRecord({ name: value.cookie.name, sameSite })
}
