// The Hono application `httpPlugin` serves (D-66, D-106): CORS, the body
// limit, each request's caller, the routes, and errors as D-72 sends them.
import { randomUUID } from 'node:crypto'
import { STATUS_CODES } from 'node:http'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getPath } from 'hono/utils/url'
import type { Caller, ErrorCode, Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { hold } from './request.ts'

/** What a route's context holds: `c.var.caller` (D-106). */
export type HttpEnv = { Variables: { caller: Caller } }

/** Routes the application writes, read by `httpPlugin({ routes })`. */
export type Routes = Hono<HttpEnv>

/** What `httpPlugin` takes (D-66, D-106). */
export interface HttpOptions {
	/** Mounted at the root, in their order. */
	readonly routes?: readonly Routes[]
	/** The origins a browser may call from; local ones outside production. */
	readonly cors?: readonly string[]
	/** Then `PORT`, then 3000. */
	readonly port?: number
	/** In bytes; 1 MB by default. */
	readonly bodyLimit?: number
}

const statuses: ReadonlyMap<string, ContentfulStatusCode> = new Map<
	ErrorCode,
	ContentfulStatusCode
>([
	['ACCESS_DENIED', 403],
	['NOT_FOUND', 404],
	['VALIDATION_FAILED', 400],
	['UNIQUE_VIOLATION', 409],
	['RELATION_RESTRICTED', 409],
	['INTERNAL', 500],
])

/** Hono's way to refuse a request, with its status (D-108). */
function refused(error: HTTPException, c: Context): Response {
	if (error.res !== undefined) return error.getResponse()
	const name = STATUS_CODES[error.status]
	const code =
		name === undefined
			? `HTTP_${error.status}`
			: name.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')
	const message = error.message === '' ? (name ?? code) : error.message
	return c.json({ code, message }, error.status)
}

/** A `PublicError` as is; any other error masked, logged with its id. */
function failed(error: unknown, c: Context, logger: Logger): Response {
	// The client left: its request failed, not the server (499, as nginx).
	if (c.req.raw.signal.aborted) return new Response(null, { status: 499 })
	if (error instanceof HTTPException) return refused(error, c)
	if (error instanceof PublicError) {
		const { code, message, details } = error
		// An application's own code is a client error (D-72).
		const status = statuses.get(code) ?? 400
		return details === undefined
			? c.json({ code, message }, status)
			: c.json({ code, message, details }, status)
	}
	const correlationId = randomUUID()
	logger.error({ correlationId, err: error }, 'A request failed.')
	return c.json(
		{ code: 'INTERNAL', message: 'Internal error.', correlationId },
		500,
	)
}

/** `http://localhost` or `http://127.0.0.1`, on any port (D-66). */
function isLocal(origin: string): boolean {
	if (!URL.canParse(origin)) return false
	const { protocol, hostname } = new URL(origin)
	return (
		protocol === 'http:' &&
		(hostname === 'localhost' || hostname === '127.0.0.1')
	)
}

/**
 * Hono's path, with control characters left encoded: a route never matches
 * one, and the development log cannot print one (D-108).
 */
const pathOf = (request: Request): string =>
	getPath(request).replaceAll(/[\p{Cc}\u2028\u2029]/gu, (char) =>
		encodeURIComponent(char),
	)

/**
 * Reads `NODE_ENV` once, when the application starts. The application's
 * routes come before those plugins mounted (D-107).
 */
export function appOf(
	options: HttpOptions,
	mounted: readonly Routes[],
	identify: (request: Request) => Promise<Caller>,
	logger: Logger,
): Hono<HttpEnv> {
	const listed = options.cors ?? []
	const local = process.env['NODE_ENV'] !== 'production'
	const maxSize = options.bodyLimit ?? 1024 * 1024
	const app = new Hono<HttpEnv>({ getPath: pathOf })
	// Each request once answered, outside production (D-108).
	if (local) {
		app.use(async (c, next) => {
			const began = performance.now()
			await next()
			const ms = Math.round(performance.now() - began)
			logger.info(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`)
		})
	}
	// Hono's `onError` receives only an `Error`; any other value thrown ends
	// here, answered as one.
	app.use(async (c, next) => {
		try {
			await next()
		} catch (error) {
			c.res = failed(error, c, logger)
		}
	})
	app.use(
		cors({
			origin: (origin) =>
				listed.includes(origin) || (local && isLocal(origin)) ? origin : null,
		}),
	)
	app.use(
		bodyLimit({
			maxSize,
			onError: (c) =>
				c.json(
					{
						code: 'PAYLOAD_TOO_LARGE',
						message: `The body is over ${maxSize} bytes.`,
					},
					413,
				),
		}),
	)
	app.use(async (c, next) => {
		hold(c, await identify(c.req.raw))
		await next()
	})
	for (const routes of [...(options.routes ?? []), ...mounted]) {
		app.route('/', routes)
	}
	app.notFound((c) =>
		c.json(
			{
				code: 'NOT_FOUND',
				message: `No route matches ${c.req.method} ${c.req.path}.`,
			},
			404,
		),
	)
	app.onError((error, c) => failed(error, c, logger))
	return app
}
