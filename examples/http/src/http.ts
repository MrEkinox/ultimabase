import type {
	HttpBrowserPolicyOptions,
	HttpPluginOptions,
	HttpRateLimitOptions,
	HttpSecurityHeadersOptions,
} from '@ultimabase/http-plugin'

import { store } from './counters.ts'
import { routes } from './routes.ts'

//#region browser
/**
 * Pages of the web application call the API from this origin, with
 * cookies (CORS). Allowed methods and headers come from the installed
 * routes and plugins.
 */
export const browser = {
	origins: ['https://links.example.com'],
	credentials: true,
} satisfies HttpBrowserPolicyOptions
//#endregion browser

//#region rate-limit
/**
 * 300 requests a minute per client address, counted in a shared store;
 * the health route is never limited.
 */
export const rateLimit = {
	default: { perMinute: 300 },
	store,
} satisfies HttpRateLimitOptions
//#endregion rate-limit

//#region security-headers
/** The web application frames its own pages; HSTS keeps its defaults. */
export const securityHeaders = {
	frameOptions: 'SAMEORIGIN',
} satisfies HttpSecurityHeadersOptions
//#endregion security-headers

//#region http-options
/** Every option of the HTTP foundation is optional; these are this API's. */
export const http = {
	appId: 'links',
	browser,
	// One reverse proxy in front: it appends the client to `X-Forwarded-For`
	// and tells the protocol in `X-Forwarded-Proto`.
	trustProxy: 1,
	rateLimit,
	bodyLimit: 262_144, // 256 KiB for every route without its own limit.
	requestTimeoutMs: 10_000,
	securityHeaders,
	// Operators send the Master key header; MasterAuthority verifies it.
	master: true,
	routes,
	accessLog: true,
} satisfies HttpPluginOptions
//#endregion http-options
