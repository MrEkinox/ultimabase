// Where a request carries its session token (D-112): the Bearer header, then
// the cookie, which auth sets and clears through a function's client (D-113).
import type { CookieOptions } from 'ultimabase'

/** The longest a browser keeps a cookie: 400 days. */
export const cookieAge: number = 400 * 24 * 60 * 60

/** The cookie's name and attributes, read once when the application starts. */
export interface Cookie {
	readonly name: string
	/** Its attributes but `maxAge`, the same to set and to clear it. */
	readonly options: CookieOptions
}

/** Secure and `__Host-` in production, so it works on `http://localhost`. */
export function cookieOf(): Cookie {
	const secure = process.env['NODE_ENV'] === 'production'
	const name = secure ? '__Host-ultimabase_session' : 'ultimabase_session'
	return {
		name,
		options: { httpOnly: true, sameSite: 'Lax', path: '/', secure },
	}
}

/**
 * The token the `Authorization` header sends, `''` for a Bearer without one,
 * `undefined` without a Bearer header, which another plugin may read.
 */
export function bearerOf(request: Request): string | undefined {
	const header = request.headers.get('authorization')
	const match = header === null ? null : /^bearer(?: +(.*))?$/i.exec(header)
	if (match === null) return undefined
	return match[1]?.trim() ?? ''
}

/** The token the cookie sends, if any. */
export function cookieTokenOf(
	request: Request,
	cookie: Cookie,
): string | undefined {
	const header = request.headers.get('cookie') ?? ''
	for (const pair of header.split(';')) {
		const [name, ...value] = pair.split('=')
		if (name?.trim() === cookie.name) return value.join('=').trim()
	}
	return undefined
}
