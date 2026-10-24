// A function's client over HTTP (D-113, D-115): the connection's address, the
// request's cookies, and those its run sets, added to the route's response.
import type { Context } from 'hono'
import { generateCookie, getCookie } from 'hono/cookie'
import type { Client } from 'ultimabase'
import type { HttpEnv } from './app.ts'

/** The client of `c`'s request, and `sent`, which adds its cookies. */
export function clientOf(c: Context<HttpEnv>): {
	readonly client: Client
	readonly sent: (response: Response) => Response
} {
	const cookies: string[] = []
	return {
		client: {
			address: c.var.address,
			cookies: {
				get: (name) => getCookie(c, name),
				set: (name, value, options) => {
					cookies.push(generateCookie(name, value, options))
				},
				clear: (name, options) => {
					cookies.push(generateCookie(name, '', { ...options, maxAge: 0 }))
				},
			},
		},
		// A route may return a Response Hono's `c.header` never reaches.
		sent: (response) => {
			if (cookies.length === 0) return response
			const headers = new Headers(response.headers)
			for (const cookie of cookies) headers.append('set-cookie', cookie)
			return new Response(response.body, {
				status: response.status,
				headers,
			})
		},
	}
}
