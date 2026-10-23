// Where a request carries its session token (D-112): the Bearer header, then
// the cookie, which auth sets and clears on a Hono response.
import type { Context } from 'hono'
import { generateCookie } from 'hono/cookie'

/** The longest a browser keeps a cookie: 400 days. */
const cookieAge = 400 * 24 * 60 * 60

/** The cookie's name and attributes, read once when the application starts. */
export interface Cookie {
	readonly name: string
	readonly secure: boolean
}

/** Secure and `__Host-` in production, so it works on `http://localhost`. */
export function cookieOf(): Cookie {
	const secure = process.env['NODE_ENV'] === 'production'
	const name = secure ? '__Host-ultimabase_session' : 'ultimabase_session'
	return { name, secure }
}

/** What auth writes on a response. */
export type Reply = Pick<Context, 'header'>

/** Sets the cookie to `token`, or clears it with an empty one. */
export function setCookie(c: Reply, cookie: Cookie, token: string): void {
	const value = generateCookie(cookie.name, token, {
		httpOnly: true,
		sameSite: 'Lax',
		path: '/',
		secure: cookie.secure,
		maxAge: token === '' ? 0 : cookieAge,
	})
	c.header('set-cookie', value, { append: true })
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
