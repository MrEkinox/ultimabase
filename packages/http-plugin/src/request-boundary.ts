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
}

export const httpPreDispatchErrorCodes: Readonly<{
	readonly applicationRejected: 'HTTP_APPLICATION_REJECTED'
	readonly badRequest: 'HTTP_BAD_REQUEST'
	readonly internalError: 'HTTP_INTERNAL_ERROR'
	readonly notFound: 'HTTP_NOT_FOUND'
	readonly requestTimeout: 'HTTP_REQUEST_TIMEOUT'
}> = immutableRecord({
	badRequest: 'HTTP_BAD_REQUEST',
	applicationRejected: 'HTTP_APPLICATION_REJECTED',
	notFound: 'HTTP_NOT_FOUND',
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

const errorContracts: Readonly<
	Record<
		HttpPreDispatchErrorCode,
		Readonly<{ readonly message: string; readonly status: number }>
	>
> = immutableRecord({
	HTTP_BAD_REQUEST: immutableRecord({
		message: 'The HTTP request is malformed.',
		status: 400,
	}),
	HTTP_APPLICATION_REJECTED: immutableRecord({
		message: 'The application or credentials were rejected.',
		status: 401,
	}),
	HTTP_NOT_FOUND: immutableRecord({
		message: 'The requested HTTP route was not found.',
		status: 404,
	}),
	HTTP_REQUEST_TIMEOUT: immutableRecord({
		message: 'The HTTP request deadline was reached.',
		status: 408,
	}),
	HTTP_INTERNAL_ERROR: immutableRecord({
		message: 'The HTTP request could not be completed.',
		status: 500,
	}),
})

/** @internal Marks one sanitized failure without retaining its raw cause. */
export class HttpPreDispatchFailure extends Error {
	readonly code: HttpPreDispatchErrorCode

	constructor(code: HttpPreDispatchErrorCode) {
		super(code)
		this.name = 'HttpPreDispatchFailure'
		this.code = code
	}
}

/** @internal Creates correlation independently from application selection. */
export const createHttpRequestId = (): string => globalThis.crypto.randomUUID()

const snapshotOriginalHeaders = (
	value: unknown,
): readonly HttpOriginalHeader[] => {
	if (!isUnknownArray(value)) {
		throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
	}
	const headers: HttpOriginalHeader[] = []
	const sensitiveCounts = new Map<string, number>()

	for (const header of value) {
		if (
			!isUnknownArray(header) ||
			header.length !== 2 ||
			typeof header[0] !== 'string' ||
			typeof header[1] !== 'string'
		) {
			throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
		}
		const pair: HttpOriginalHeader = immutableArray([header[0], header[1]])
		headers.push(pair)
		const normalizedName = header[0].toLowerCase()
		if (sensitiveHeaderNames.has(normalizedName)) {
			const count = (sensitiveCounts.get(normalizedName) ?? 0) + 1
			if (count > 1) {
				throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
			}
			sensitiveCounts.set(normalizedName, count)
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
		throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
	}
	const originalHeaders = snapshotOriginalHeaders(
		untrustedInput.originalHeaders,
	)
	const suppliedRequestId = readPreparedHeader(
		originalHeaders,
		httpRequestIdHeader,
	)
	if (
		suppliedRequestId !== undefined &&
		!requestIdPattern.test(suppliedRequestId)
	) {
		throw new HttpPreDispatchFailure(httpPreDispatchErrorCodes.badRequest)
	}

	return immutableRecord({
		input: immutableRecord({
			originalHeaders,
			request: untrustedInput.request,
		}),
		originalHeaders,
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

/** @internal Reads mandatory application selection from validated evidence. */
export const readPreparedApplicationId = (
	prepared: PreparedHttpServerRequest,
): string => {
	const appId = readPreparedHeader(
		prepared.originalHeaders,
		httpApplicationIdHeader,
	)
	if (appId === undefined || appId.length === 0) {
		throw new HttpPreDispatchFailure(
			httpPreDispatchErrorCodes.applicationRejected,
		)
	}
	return appId
}

/** @internal Emits only the approved stable public failure contract. */
export const createHttpPreDispatchErrorResponse = (
	code: HttpPreDispatchErrorCode,
	requestId: string,
): Response => {
	const contract = errorContracts[code]
	const body: HttpPreDispatchErrorEnvelope = immutableRecord({
		error: immutableRecord({
			code,
			message: contract.message,
			requestId,
			retryable: false as const,
		}),
	})
	return Response.json(body, {
		headers: {
			'Cache-Control': 'private, no-store',
			[httpRequestIdHeader]: requestId,
		},
		status: contract.status,
	})
}

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

/** @internal Removes credentials before downstream protocol handlers begin. */
export const withoutHttpCredentialHeaders = (
	request: Request,
	names: readonly string[],
	signal: AbortSignal,
): Request => {
	const headers = new Headers(request.headers)
	for (const name of names) headers.delete(name)
	return new Request(request, { headers, signal })
}
