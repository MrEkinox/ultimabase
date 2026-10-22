// The Hono application `httpPlugin` serves (D-66, D-106): CORS, the body
// limit, each request's caller, the routes, and errors as D-72 sends them.
import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Caller, ErrorCode, Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'

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

/** A `PublicError` as is; any other error masked, logged with its id. */
function failed(error: unknown, c: Context, logger: Logger): Response {
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

/** Reads `NODE_ENV` once, when the application starts. */
export function appOf(
	options: HttpOptions,
	identify: (request: Request) => Promise<Caller>,
	logger: Logger,
): Hono<HttpEnv> {
	const listed = options.cors ?? []
	const local = process.env['NODE_ENV'] !== 'production'
	const maxSize = options.bodyLimit ?? 1024 * 1024
	const app = new Hono<HttpEnv>()
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
		c.set('caller', await identify(c.req.raw))
		await next()
	})
	for (const routes of options.routes ?? []) app.route('/', routes)
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
