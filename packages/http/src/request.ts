// What each route's context holds (D-106, D-108): the caller, and a body
// that, when it is not JSON, is the client's error.
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Caller } from 'ultimabase'
import type { HttpEnv } from './app.ts'

export function hold(c: Context<HttpEnv>, caller: Caller): void {
	c.set('caller', caller)
	const read: () => Promise<unknown> = c.req.json.bind(c.req)
	// Only parsing the body throws a `SyntaxError` here, not the server's code.
	Object.defineProperty(c.req, 'json', {
		value: async () => {
			try {
				return await read()
			} catch (error) {
				if (!(error instanceof SyntaxError)) throw error
				throw new HTTPException(400, {
					message: 'Malformed JSON in request body',
					cause: error,
				})
			}
		},
	})
}
