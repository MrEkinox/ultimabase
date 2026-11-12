// The Hono application `httpPlugin` serves (D-66, D-106): no caching, the
// probes (D-204), CORS, the rate limit (D-218), the plugins' gates (D-205), forms from other
// origins, the body limit, each request's caller, the routes, the reset
// route outside production (D-188), and errors as D-72 sends them.
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
import { logFailure } from 'ultimabase/internal'
import { isOwnOrigin } from './address.ts'
import type { Limiter, RateLimit } from './limit.ts'
import { tooMany } from './limit.ts'
import type { Probes } from './probes.ts'
import { probeRoutes } from './probes.ts'
import { hold } from './request.ts'
import { resetRoutes } from './reset.ts'
import { bodyLimitOf } from './server.ts'
import type { Gate } from './upgrade.ts'
import { answer } from './upgrade.ts'

/**
 * What a route's context holds: `c.var.caller` (D-106), `c.var.address`,
 * the client's, `''` when unknown (D-113, D-116), and `c.var.logger`, the
 * application's (D-364).
 */
export type HttpEnv = {
	Variables: { caller: Caller; address: string; logger: Logger }
}

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
	/**
	 * In milliseconds, how long the stop waits once `/ready` answers 503,
	 * serving as before: 5000 under `NODE_ENV=production`, 0 otherwise (D-204).
	 */
	readonly drain?: number
	/**
	 * Each public address's requests and upgrades, counted in the instance's
	 * memory: 600 a minute by default, `false` for none (D-218).
	 */
	readonly rateLimit?: RateLimit | false
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
	['RELATION_SIZE', 409],
	['UNAUTHENTICATED', 401],
	['INVALID_CREDENTIALS', 401],
	['TOO_MANY_ATTEMPTS', 429],
	['CONFLICT', 409],
	['UNAVAILABLE', 503],
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
		// Its details say when to retry, in seconds (D-113, D-335).
		if (
			(code === 'TOO_MANY_ATTEMPTS' || code === 'UNAVAILABLE') &&
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
	const correlationId = logFailure(logger, error, 'A request failed.')
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
 * Sets a header of an answered request on the response itself: `c.header` would
 * copy it, and the copy, unlike the adapter's own response, sends its body
 * through a stream. A response of `fetch` or `Response.redirect` keeps its
 * headers: that one is copied.
 */
function stamp(c: Context, name: string, value: string, append = false): void {
	try {
		if (append) c.res.headers.append(name, value)
		else c.res.headers.set(name, value)
	} catch {
		c.header(name, value, { append })
	}
}

/**
 * Reads `NODE_ENV` once, when the application starts. The application's
 * routes come before those plugins mounted (D-107).
 */
export function appOf(
	options: HttpOptions,
	mounted: readonly Mounted[],
	{
		probes,
		gates,
		rateLimit,
		addressOf,
	}: {
		readonly probes: Probes
		readonly gates: readonly Gate[]
		readonly rateLimit: Limiter
		readonly addressOf: (env: unknown) => string
	},
	identify: (request: Request) => Promise<Caller>,
	logger: Logger,
): Hono<HttpEnv> {
	const local = process.env['NODE_ENV'] !== 'production'
	const allows = allowing(options)
	const maxSize = bodyLimitOf(options.bodyLimit)
	const app = new Hono<HttpEnv>({ getPath: pathOf })
	// A response may hold the caller's data: no cache keeps one, errors
	// included, unless its route says otherwise (D-106).
	app.use(async (c, next) => {
		await next()
		if (!c.res.headers.has('cache-control'))
			stamp(c, 'cache-control', 'no-store')
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
	// Before CORS and the caller: a probe reads neither (D-204).
	app.route('/', probeRoutes(probes, logger))
	const allowed = (origin: string) => (allows(origin) ? origin : null)
	// Allowed origins send cookies (D-112); a browser keeps a preflight 10 min (D-348).
	const preflight = cors({ origin: allowed, credentials: true, maxAge: 600 })
	app.use(async (c, next) => {
		// Hono's `cors` answers every OPTIONS: a route's own runs, unless the
		// request is a preflight.
		if (
			c.req.method === 'OPTIONS' &&
			c.req.header('access-control-request-method') !== undefined
		) {
			return preflight(c, next)
		}
		await next()
		const origin = allowed(c.req.header('origin') ?? '')
		if (origin !== null) {
			stamp(c, 'access-control-allow-origin', origin)
			stamp(c, 'access-control-allow-credentials', 'true')
		}
		stamp(c, 'vary', 'Origin', true)
	})
	// Before the gates and the caller: a flood reads no session (D-218).
	app.use(async (c, next) => {
		const wait = await rateLimit(c.req.raw, addressOf(c.env))
		return wait === undefined ? next() : tooMany(wait)
	})
	// The plugins' gates, as maintenance: a refusal keeps CORS's headers, so
	// that a browser reads it (D-205).
	app.use(async (c, next) => {
		const gated = await answer(gates, c.req.raw)
		return gated ?? next()
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
			!isOwnOrigin(origin ?? '', c.req.url) &&
			allowed(origin ?? '') === null
		) {
			throw new PublicError(
				'ACCESS_DENIED',
				'A form from another origin is refused.',
			)
		}
		await next()
	})
	const tooLarge = (c: Context) =>
		c.json(
			{
				code: 'PAYLOAD_TOO_LARGE',
				message: `The body is over ${maxSize} bytes.`,
			},
			413,
		)
	const limit = bodyLimit({ maxSize, onError: tooLarge })
	// The routes of the mounts that read their own body, by method: their
	// `use` and `all` match any request, so they never lift the limit (D-153).
	const unlimited = new Hono()
	for (const mount of mounted.filter((each) => !each.bodyLimit)) {
		for (const { method, path } of mount.routes.routes) {
			if (method !== 'ALL') unlimited.on(method, path, (c) => c.body(null))
		}
	}
	app.use(async (c, next) => {
		if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
		const [matched] = unlimited.router.match(c.req.method, c.req.path)
		if (matched.length > 0) return next()
		// Hono's limit opens the body to read this header.
		const declared = c.req.header('content-length')
		if (
			declared === undefined ||
			c.req.header('transfer-encoding') !== undefined
		) {
			return limit(c, next)
		}
		return Number(declared) > maxSize ? tooLarge(c) : next()
	})
	app.use(async (c, next) => {
		hold(c, await identify(c.req.raw), addressOf(c.env))
		await next()
	})
	for (const routes of [
		...(options.routes ?? []),
		...mounted.map((mount) => mount.routes),
		...(local ? [resetRoutes] : []),
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
