// The Hono application `httpPlugin` serves (D-66, D-106): no caching, CORS,
// forms from other origins, the body limit, each request's caller, the
// routes, and errors as D-72 sends them.
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
import { isLocalHost, PublicError } from 'ultimabase'
import { addresses, proxiesOf } from './address.ts'
import { hold } from './request.ts'
import type { Gate } from './upgrade.ts'

/**
 * What a route's context holds: `c.var.caller` (D-106) and `c.var.address`,
 * the client's, `''` when unknown (D-113, D-116).
 */
export type HttpEnv = { Variables: { caller: Caller; address: string } }

/** Routes the application writes, read by `httpPlugin({ routes })`. */
export type Routes = Hono<HttpEnv>

/** Routes a plugin mounted; `bodyLimit: false` when they read their own body (D-153). */
export interface Mounted {
	readonly routes: Routes
	readonly bodyLimit: boolean
}

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
	/** In front of the server, which then reads the client's address from `X-Forwarded-For`; 0 by default (D-116). */
	readonly proxies?: number
	/**
	 * Answers each WebSocket upgrade before the plugin that takes it: a
	 * response refuses it, as during maintenance (D-166).
	 */
	readonly upgrade?: Gate
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
	['UNAUTHENTICATED', 401],
	['INVALID_CREDENTIALS', 401],
	['TOO_MANY_ATTEMPTS', 429],
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
		// Its details say when to retry, in seconds (D-113).
		if (
			code === 'TOO_MANY_ATTEMPTS' &&
			typeof details === 'object' &&
			details !== null
		) {
			const wait: unknown = Reflect.get(details, 'retryAfter')
			if (typeof wait === 'number') c.header('retry-after', String(wait))
		}
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

/** A local host over `http:`, on any port. */
function isLocal(origin: string): boolean {
	if (!URL.canParse(origin)) return false
	const { protocol, hostname } = new URL(origin)
	return protocol === 'http:' && isLocalHost(hostname)
}

/**
 * Whether a browser may call from `origin`, with its cookies: a listed one,
 * or a local one outside production. Reads `NODE_ENV` once.
 */
export function allowing(options: HttpOptions): (origin: string) => boolean {
	const listed = options.cors ?? []
	const local = process.env['NODE_ENV'] !== 'production'
	return (origin) => listed.includes(origin) || (local && isLocal(origin))
}

const safe = new Set(['GET', 'HEAD', 'OPTIONS'])
/** What an HTML form sends, `text/plain` when it names none. */
const form =
	/^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)\b/i

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
	mounted: readonly Mounted[],
	identify: (request: Request) => Promise<Caller>,
	logger: Logger,
): Hono<HttpEnv> {
	const local = process.env['NODE_ENV'] !== 'production'
	const allows = allowing(options)
	const maxSize = options.bodyLimit ?? 1024 * 1024
	const addressOf = addresses(proxiesOf(options.proxies), logger)
	const app = new Hono<HttpEnv>({ getPath: pathOf })
	// A response may hold the caller's data: no cache keeps one, errors
	// included, unless its route says otherwise (D-106).
	app.use(async (c, next) => {
		await next()
		if (!c.res.headers.has('cache-control'))
			c.header('cache-control', 'no-store')
	})
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
	const allowed = (origin: string) => (allows(origin) ? origin : null)
	// An allowed origin sends its cookies, as auth's session (D-112).
	const preflight = cors({ origin: allowed, credentials: true })
	app.use(async (c, next) => {
		// Hono's `cors` answers every OPTIONS: a route's own runs, unless the
		// request is a preflight.
		const asked = c.req.header('access-control-request-method')
		if (c.req.method !== 'OPTIONS' || asked !== undefined) {
			return preflight(c, next)
		}
		await next()
		const origin = allowed(c.req.header('origin') ?? '')
		if (origin !== null) {
			c.header('access-control-allow-origin', origin)
			c.header('access-control-allow-credentials', 'true')
		}
		c.header('vary', 'Origin', { append: true })
	})
	// A browser sends a form to any site, with that site's cookies, and no
	// CORS check stops it: a form from a browser, which names its origin or
	// its site, or with cookies, comes from an allowed origin (D-106). Without
	// cookies, another site's form would sign its visitor in to its own
	// account. A webhook sends neither header, nor cookies.
	app.use(async (c, next) => {
		const origin = c.req.header('origin')
		const site = c.req.header('sec-fetch-site')
		if (
			!safe.has(c.req.method) &&
			form.test(c.req.header('content-type') ?? 'text/plain') &&
			(c.req.header('cookie') !== undefined ||
				origin !== undefined ||
				site !== undefined) &&
			site !== 'same-origin' &&
			origin !== new URL(c.req.url).origin &&
			allowed(origin ?? '') === null
		) {
			throw new PublicError(
				'ACCESS_DENIED',
				'A form from another origin is refused.',
			)
		}
		await next()
	})
	const limit = bodyLimit({
		maxSize,
		onError: (c) =>
			c.json(
				{
					code: 'PAYLOAD_TOO_LARGE',
					message: `The body is over ${maxSize} bytes.`,
				},
				413,
			),
	})
	// The routes of the mounts that read their own body, by method: their
	// `use` and `all` match any request, so they never lift the limit (D-153).
	const unlimited = new Hono()
	for (const mount of mounted.filter((each) => !each.bodyLimit)) {
		for (const { method, path } of mount.routes.routes) {
			if (method !== 'ALL') unlimited.on(method, path, (c) => c.body(null))
		}
	}
	app.use(async (c, next) => {
		const [matched] = unlimited.router.match(c.req.method, c.req.path)
		if (matched.length > 0) await next()
		else return limit(c, next)
	})
	app.use(async (c, next) => {
		hold(c, await identify(c.req.raw), addressOf(c.env))
		await next()
	})
	for (const routes of [
		...(options.routes ?? []),
		...mounted.map((mount) => mount.routes),
	]) {
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
