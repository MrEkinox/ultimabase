// What each route's context holds (D-106, D-108): the caller, and a body
// that, when it is not the JSON or the form it claims, is the client's error.
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Caller } from 'ultimabase'
import type { HttpEnv } from './app.ts'

/** `c.req[method]`, its parsing failure, `parsing`, a 400. */
function malformed(
	c: Context<HttpEnv>,
	method: 'json' | 'formData' | 'parseBody',
	parsing: typeof SyntaxError | typeof TypeError,
	message: string,
): void {
	const read: (...args: never[]) => Promise<unknown> = c.req[method].bind(c.req)
	Object.defineProperty(c.req, method, {
		value: async (...args: never[]) => {
			try {
				return await read(...args)
			} catch (error) {
				if (!(error instanceof parsing)) throw error
				throw new HTTPException(400, { message, cause: error })
			}
		},
	})
}

export function hold(c: Context<HttpEnv>, caller: Caller): void {
	c.set('caller', caller)
	// Only parsing the body throws these here, not the server's code.
	malformed(c, 'json', SyntaxError, 'Malformed JSON in request body')
	const form = 'Malformed form data in request body'
	malformed(c, 'formData', TypeError, form)
	malformed(c, 'parseBody', TypeError, form)
}
