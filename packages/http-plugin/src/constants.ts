import type { HttpMethod } from './endpoints.js'

/** Selects one exact public HTTP application without granting authority. */
export const httpApplicationIdHeader = 'X-UltimaBase-Application-Id'
/** Reserves the only path namespace allowed to bootstrap one browser UI. */
export const httpBrowserBootstrapPathPrefix = '/__ultimabase/apps'

/** Selects audited Master verification only when explicitly enabled. */
export const httpMasterKeyHeader = 'X-UltimaBase-Master-Key'

/** Carries validated or generated request correlation on every response. */
export const httpRequestIdHeader = 'X-UltimaBase-Request-Id'

/** Versions the provider-facing application graph independently from packages. */
export const httpApplicationProtocolVersion = '1.0.0'

/** Requires evidence captured before Fetch combines repeated header fields. */
export const httpOriginalHeaderMode = 'ordered-pairs'

// The supported vocabulary is shared by routes and browser policy.
const httpMethods: ReadonlySet<string> = new Set<HttpMethod>([
	'DELETE',
	'GET',
	'HEAD',
	'OPTIONS',
	'PATCH',
	'POST',
	'PUT',
])

/** @internal Accepts only the exact supported uppercase method names. */
export const isHttpMethod = (value: unknown): value is HttpMethod =>
	typeof value === 'string' && httpMethods.has(value)

/** @internal Rejects the reserved browser bootstrap namespace and its subtree. */
export const isReservedHttpPath = (path: string): boolean =>
	path === httpBrowserBootstrapPathPrefix ||
	path.startsWith(`${httpBrowserBootstrapPathPrefix}/`)

// Timers clamp larger delays to 1 ms, so a larger deadline would expire at once.
const maximumHttpRequestTimeoutMs = 2_147_483_647

/** @internal Describes the accepted request deadline range in error messages. */
export const httpRequestTimeoutMsRange =
	'a positive safe integer no greater than 2147483647'

/** @internal Accepts only deadlines that `AbortSignal.timeout()` honors exactly. */
export const isHttpRequestTimeoutMs = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isSafeInteger(value) &&
	value > 0 &&
	value <= maximumHttpRequestTimeoutMs
