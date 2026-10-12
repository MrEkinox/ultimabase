import {
	httpApplicationIdHeader,
	httpBrowserBootstrapPathPrefix,
} from '@ultimabase/http-plugin'

/** Serializes one value for a script without closing or breaking it. */
export const serializeInline = (value: unknown): string =>
	JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e')
		.replaceAll('&', '\\u0026')
		.replaceAll(' ', '\\u2028')
		.replaceAll(' ', '\\u2029')

/** Locks one explorer page to its own nonce and the listed sources. */
export const explorerSecurityHeaders = (policy: readonly string[]): Headers =>
	new Headers({
		'Content-Security-Policy': [
			"default-src 'none'",
			...policy,
			"base-uri 'none'",
			"form-action 'none'",
			"frame-ancestors 'none'",
		].join('; '),
		'Content-Type': 'text/html; charset=utf-8',
		'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
		'Referrer-Policy': 'no-referrer',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
	})

/**
 * Declares `endpoint` and `applicationHeaders` in the page script: the page
 * served at `/graphiql` sends no application header; the one served at
 * `/__ultimabase/apps/{appId}/graphiql`, used with several applications,
 * sends the application ID read from its own URL (ADR-0325).
 */
export const explorerRequestScript = (graphqlPath: string): string => `
const prefix=${serializeInline(`${httpBrowserBootstrapPathPrefix}/`)};
const pathname=window.location.pathname;
const appId=pathname.startsWith(prefix)?decodeURIComponent(pathname.slice(prefix.length,pathname.indexOf('/',prefix.length))):undefined;
const endpoint=${serializeInline(graphqlPath)};
const applicationHeaders=appId===undefined?{}:{[${serializeInline(httpApplicationIdHeader)}]:appId};`
