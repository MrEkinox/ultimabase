import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	httpApplicationIdHeader,
	httpMasterKeyHeader,
	httpRequestIdHeader,
} from './constants.js'

/** Carries original header evidence captured before Fetch normalization. */
export type HttpOriginalHeader = readonly [name: string, value: string]

/** Supplies one normalized Fetch request plus its ordered original headers. */
export interface HttpServerRequest {
	readonly request: Request
	readonly originalHeaders: readonly HttpOriginalHeader[]
	/**
	 * Address of the connection's peer, used for rate limiting and proxy trust.
	 * @example "203.0.113.7"
	 */
	readonly remoteAddress?: string | undefined
}

export const httpPreDispatchErrorCodes: Readonly<{
	readonly applicationRejected: 'HTTP_APPLICATION_REJECTED'
	readonly applicationUnknown: 'HTTP_APPLICATION_UNKNOWN'
	readonly badRequest: 'HTTP_BAD_REQUEST'
	readonly corsDisabled: 'HTTP_CORS_DISABLED'
	readonly internalError: 'HTTP_INTERNAL_ERROR'
	readonly notFound: 'HTTP_NOT_FOUND'
	readonly payloadTooLarge: 'HTTP_PAYLOAD_TOO_LARGE'
	readonly rateLimited: 'HTTP_RATE_LIMITED'
	readonly requestTimeout: 'HTTP_REQUEST_TIMEOUT'
}> = immutableRecord({
	badRequest: 'HTTP_BAD_REQUEST',
	applicationRejected: 'HTTP_APPLICATION_REJECTED',
	applicationUnknown: 'HTTP_APPLICATION_UNKNOWN',
	corsDisabled: 'HTTP_CORS_DISABLED',
	notFound: 'HTTP_NOT_FOUND',
	payloadTooLarge: 'HTTP_PAYLOAD_TOO_LARGE',
	rateLimited: 'HTTP_RATE_LIMITED',
	requestTimeout: 'HTTP_REQUEST_TIMEOUT',
	internalError: 'HTTP_INTERNAL_ERROR',
} as const)

export type HttpPreDispatchErrorCode =
	(typeof httpPreDispatchErrorCodes)[keyof typeof httpPreDispatchErrorCodes]

/** Defines the stable protocol-neutral error body emitted before route handling. */
export interface HttpPreDispatchErrorEnvelope {
	readonly error: Readonly<{
		readonly code: HttpPreDispatchErrorCode
		readonly message: string
		readonly requestId: string
		readonly retryable: false
	}>
}

/** @internal Retains validated cardinality without exposing mutable headers. */
export interface PreparedHttpServerRequest {
	readonly input: HttpServerRequest
	readonly originalHeaders: readonly HttpOriginalHeader[]
	readonly remoteAddress: string | undefined
	readonly requestId: string
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u
const sensitiveHeaderNames = new Set(
	[
		'Access-Control-Request-Headers',
		'Access-Control-Request-Method',
		httpApplicationIdHeader,
		httpMasterKeyHeader,
		'Authorization',
		'Cookie',
		'Content-Length',
		'Origin',
		httpRequestIdHeader,
	].map((name) => name.toLowerCase()),
)

// Every pre-dispatch failure maps to one fixed status and non-revealing message.
const errorContracts: Readonly<
	Record<HttpPreDispatchErrorCode, readonly [status: number, message: string]>
> = immutableRecord({
	HTTP_BAD_REQUEST: [400, 'The HTTP request is malformed.'],
	HTTP_APPLICATION_REJECTED: [
		401,
		'The application or credentials were rejected.',
	],
	HTTP_APPLICATION_UNKNOWN: [404, 'The HTTP application is unknown.'],
	HTTP_CORS_DISABLED: [403, 'CORS is not enabled: configure browser.origins'],
	HTTP_NOT_FOUND: [404, 'The requested HTTP route was not found.'],
	HTTP_PAYLOAD_TOO_LARGE: [413, 'The HTTP request body is too large.'],
	HTTP_RATE_LIMITED: [429, 'Too many HTTP requests; retry later.'],
	HTTP_REQUEST_TIMEOUT: [408, 'The HTTP request deadline was reached.'],
	HTTP_INTERNAL_ERROR: [500, 'The HTTP request could not be completed.'],
})

/**
 * @internal Explains a request that reached the network path without the
 * headers every network connection carries (ADR-0323).
 */
export const httpNetworkHeadersMissingMessage =
	'The HTTP request carries no network connection headers: serve it through a server plugin, or call ultimabase.plugin(httpPlugin).fetch(request) without a server.'

/** @internal Marks one sanitized failure without retaining its raw cause. */
class HttpPreDispatchFailure extends Error {
	readonly code: HttpPreDispatchErrorCode

	constructor(code: HttpPreDispatchErrorCode) {
		super(code)
		this.name = 'HttpPreDispatchFailure'
		this.code = code
	}
}

/** @internal Creates correlation independently from application identity validation. */
const createHttpRequestId = (): string => globalThis.crypto.randomUUID()

const badRequest = (): HttpPreDispatchFailure =>
	new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)

// Copies string pairs and rejects any repeated security-relevant header name.
const snapshotOriginalHeaders = (
	value: unknown,
): readonly HttpOriginalHeader[] => {
	if (!isUnknownArray(value)) throw badRequest()
	const headers: HttpOriginalHeader[] = []
	const seenSensitiveNames = new Set<string>()
	for (const header of value) {
		if (!isUnknownArray(header) || header.length !== 2) throw badRequest()
		// Read each slot once so the validated value is the one retained.
		const name: unknown = header[0]
		const headerValue: unknown = header[1]
		if (typeof name !== 'string' || typeof headerValue !== 'string') {
			throw badRequest()
		}
		headers.push(immutableArray([name, headerValue]))
		const normalizedName = name.toLowerCase()
		if (sensitiveHeaderNames.has(normalizedName)) {
			if (seenSensitiveNames.has(normalizedName)) throw badRequest()
			seenSensitiveNames.add(normalizedName)
		}
	}
	return immutableArray(headers)
}

/** @internal Validates every ambiguity before application-owned behavior. */
export const prepareHttpServerRequest = (
	input: HttpServerRequest,
): PreparedHttpServerRequest => {
	const untrustedInput: unknown = input
	if (
		!isPlainRecord(untrustedInput) ||
		!(untrustedInput.request instanceof Request)
	) {
		throw badRequest()
	}
	const originalHeaders = snapshotOriginalHeaders(
		untrustedInput.originalHeaders,
	)
	const remoteAddress = untrustedInput.remoteAddress
	if (remoteAddress !== undefined && typeof remoteAddress !== 'string') {
		throw badRequest()
	}
	const suppliedRequestId = readPreparedHeader(
		originalHeaders,
		httpRequestIdHeader,
	)
	if (
		suppliedRequestId !== undefined &&
		!requestIdPattern.test(suppliedRequestId)
	) {
		throw badRequest()
	}

	return immutableRecord({
		input: immutableRecord({
			originalHeaders,
			remoteAddress,
			request: untrustedInput.request,
		}),
		originalHeaders,
		remoteAddress,
		requestId: suppliedRequestId ?? createHttpRequestId(),
	})
}

/** @internal Reads one already cardinality-checked raw value without splitting it. */
export const readPreparedHeader = (
	headers: readonly HttpOriginalHeader[],
	name: string,
): string | undefined => {
	const normalizedName = name.toLowerCase()
	return headers.find(
		([candidate]) => candidate.toLowerCase() === normalizedName,
	)?.[1]
}

/** @internal Emits only the approved stable public failure contract. */
export const createHttpPreDispatchErrorResponse = (
	code: HttpPreDispatchErrorCode,
	requestId: string,
	options: Readonly<{
		readonly headers?: Readonly<Record<string, string>>
		readonly message?: string
	}> = {},
): Response => {
	const [status, message] = errorContracts[code]
	const body: HttpPreDispatchErrorEnvelope = immutableRecord({
		error: immutableRecord({
			code,
			message: options.message ?? message,
			requestId,
			retryable: false as const,
		}),
	})
	return Response.json(body, {
		headers: {
			...options.headers,
			'Cache-Control': 'private, no-store',
			[httpRequestIdHeader]: requestId,
		},
		status,
	})
}

/**
 * @internal Answers one public error: a `PublicError` thrown by a route
 * handler (ADR-0305, status 400), or an error a context resolver declared with
 * its status (ADR-0341), with its code, public message and details.
 */
export const createHttpPublicErrorResponse = (
	payload: Readonly<{
		code: string
		details?: Readonly<Record<string, unknown>> | undefined
		message?: string | undefined
		retryable?: boolean
	}>,
	requestId: string,
	status = 400,
): Response =>
	Response.json(
		immutableRecord({
			error: immutableRecord({
				code: payload.code,
				message:
					payload.message ??
					errorContracts[httpPreDispatchErrorCodes.applicationRejected][1],
				requestId,
				retryable: payload.retryable ?? false,
				...(payload.details === undefined ? {} : { details: payload.details }),
			}),
		}),
		{
			headers: {
				'Cache-Control': 'private, no-store',
				[httpRequestIdHeader]: requestId,
			},
			status,
		},
	)

/** @internal Adds correlation and private caching without mutating owner responses. */
export const finalizeHttpResponse = (
	response: Response,
	requestId: string,
): Response => {
	const headers = new Headers(response.headers)
	headers.set('Cache-Control', 'private, no-store')
	headers.set(httpRequestIdHeader, requestId)
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}

/**
 * @internal Validates provider input, or answers with the sanitized failure and a
 * fresh correlation ID because the supplied one cannot be trusted yet.
 */
export const prepareHttpServerRequestOrReject = (
	input: HttpServerRequest,
): PreparedHttpServerRequest | Response => {
	try {
		return prepareHttpServerRequest(input)
	} catch (error: unknown) {
		return createHttpPreDispatchErrorResponse(
			error instanceof HttpPreDispatchFailure
				? error.code
				: httpPreDispatchErrorCodes.internalError,
			createHttpRequestId(),
		)
	}
}

/**
 * @internal Copies a request with a new URL, headers, signal and body.
 * Hono's Node adapter may supply a Fetch-compatible Request from another
 * implementation. Reconstruct from public fields instead of relying on native
 * Request private slots shared by same-realm clones.
 */
export const rebuildHttpRequest = (
	source: Request,
	url: string | URL,
	headers: Headers,
	signal: AbortSignal,
	body: ReadableStream<Uint8Array> | null,
): Request =>
	new Request(url, {
		...(body === null ? {} : { body, duplex: 'half' }),
		cache: source.cache,
		credentials: source.credentials,
		headers,
		integrity: source.integrity,
		keepalive: source.keepalive,
		method: source.method,
		mode: source.mode,
		redirect: source.redirect,
		referrer: source.referrer,
		referrerPolicy: source.referrerPolicy,
		signal,
	})

/** @internal Removes credentials before downstream protocol handlers begin. */
export const withoutHttpCredentialHeaders = (
	request: Request,
	names: readonly string[],
	signal: AbortSignal,
	body: ReadableStream<Uint8Array> | null,
): Request => {
	const headers = new Headers(request.headers)
	for (const name of names) headers.delete(name)
	return rebuildHttpRequest(request, request.url, headers, signal, body)
}
