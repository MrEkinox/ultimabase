import { FrameworkError, PluginError } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import {
	RestMutationNormalizationError,
	RestOperationNormalizationError,
	RestReadNormalizationError,
	type RestNormalizationError,
} from './errors.js'
import { encodeRestJsonValue } from './response-values.js'
import type {
	RestPluginOperationRouteDefinition,
	RestSchemaMutationRouteDefinition,
} from './routes.js'

type RestPluginErrorRoute =
	RestPluginOperationRouteDefinition | RestSchemaMutationRouteDefinition

export const restResponseErrorCodes: Readonly<{
	readonly badRequest: 'REST_BAD_REQUEST'
	readonly internalError: 'REST_INTERNAL_ERROR'
	readonly notAcceptable: 'REST_NOT_ACCEPTABLE'
	readonly notFound: 'REST_NOT_FOUND'
	readonly unsupportedVersion: 'REST_UNSUPPORTED_VERSION'
}> = immutableRecord({
	badRequest: 'REST_BAD_REQUEST',
	internalError: 'REST_INTERNAL_ERROR',
	notAcceptable: 'REST_NOT_ACCEPTABLE',
	notFound: 'REST_NOT_FOUND',
	unsupportedVersion: 'REST_UNSUPPORTED_VERSION',
} as const)

export type RestResponseErrorCode =
	(typeof restResponseErrorCodes)[keyof typeof restResponseErrorCodes]

export interface RestErrorEnvelope {
	readonly error: Readonly<{
		readonly code: string
		readonly details?: Readonly<Record<string, unknown>>
		readonly message: string
		readonly requestId: string
		readonly retryable: boolean
	}>
}

interface RestPublicFailure {
	readonly code: string
	readonly details?: Readonly<Record<string, unknown>>
	readonly message: string
	readonly retryable: boolean
	readonly status: number
}

const responseContracts: Readonly<
	Record<RestResponseErrorCode, Readonly<{ message: string; status: number }>>
> = immutableRecord({
	REST_BAD_REQUEST: { message: 'The REST request is malformed.', status: 400 },
	REST_INTERNAL_ERROR: {
		message: 'The REST request could not be completed.',
		status: 500,
	},
	REST_NOT_ACCEPTABLE: {
		message: 'The requested REST response media type is not available.',
		status: 406,
	},
	REST_NOT_FOUND: {
		message: 'The requested REST route was not found.',
		status: 404,
	},
	REST_UNSUPPORTED_VERSION: {
		message: 'The requested REST protocol version is not supported.',
		status: 400,
	},
})

// Neutral storage conflicts (ADR-0302) are client-visible 409 responses.
const frameworkStatuses: ReadonlyMap<string, number> = new Map([
	['MASTER_ACCESS_DENIED', 403],
	['NOT_FOUND', 404],
	['PERMISSION_DENIED', 403],
	['REFERENCE_VIOLATION', 409],
	['TRANSACTION_CONFLICT', 409],
	['UNIQUE_VIOLATION', 409],
	['VALIDATION_ERROR', 422],
])

const internalFailure = (): RestPublicFailure =>
	immutableRecord({
		code: restResponseErrorCodes.internalError,
		retryable: false,
		...responseContracts.REST_INTERNAL_ERROR,
	})

// Public details must stay representable JSON, or the whole failure is withheld.
const publicFailure = (
	payload: Readonly<{
		code: string
		details?: Readonly<Record<string, unknown>> | undefined
		message?: string | undefined
		retryable: boolean
	}>,
	status: number | undefined,
): RestPublicFailure => {
	if (payload.message === undefined || status === undefined) {
		return internalFailure()
	}
	let details: Readonly<Record<string, unknown>> | undefined
	try {
		details =
			payload.details === undefined
				? undefined
				: // Encoding a JSON record always yields a frozen JSON record.
					(encodeRestJsonValue(
						payload.details,
						() => new TypeError(),
					) as Readonly<Record<string, unknown>>)
	} catch {
		return internalFailure()
	}
	return immutableRecord({
		code: payload.code,
		message: payload.message,
		retryable: payload.retryable,
		status,
		...(details === undefined ? {} : { details }),
	})
}

// `instanceof` widens generic error classes to `any`; these guards keep defaults.
const isNormalizationError = (
	error: unknown,
): error is RestNormalizationError =>
	error instanceof RestReadNormalizationError ||
	error instanceof RestMutationNormalizationError ||
	error instanceof RestOperationNormalizationError
const isFrameworkError = (error: unknown): error is FrameworkError =>
	error instanceof FrameworkError
const isPluginError = (error: unknown): error is PluginError =>
	error instanceof PluginError

const caughtFailure = (
	error: unknown,
	route: RestPluginErrorRoute | undefined,
	statusFor: (operation: string, code: string) => number | undefined,
): RestPublicFailure => {
	if (isNormalizationError(error)) {
		const { code, message } = error.issue
		return publicFailure(
			{ code, message, retryable: false },
			code.endsWith('_BODY_TOO_LARGE')
				? 413
				: code.endsWith('_UNSUPPORTED_MEDIA_TYPE')
					? 415
					: 400,
		)
	}
	if (isFrameworkError(error)) {
		const payload = error.toJSON()
		return publicFailure(payload, frameworkStatuses.get(payload.code) ?? 500)
	}
	if (!isPluginError(error) || route === undefined) {
		return internalFailure()
	}
	// Only a declared error with a statically mapped status keeps its message.
	const payload = error.toJSON()
	const operation =
		route.kind === 'rest-schema-mutation-route'
			? route.mutation
			: route.operation
	return publicFailure(payload, statusFor(operation, payload.code))
}

/** Creates a canonical JSON response before HTTP adds its request metadata header. */
export const createRestJsonResponse = (
	body: unknown,
	status: number,
): Response =>
	new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		status,
	})

const createRestErrorResponse = (
	failure: RestPublicFailure,
	requestId: string,
): Response => {
	const body: RestErrorEnvelope = immutableRecord({
		error: immutableRecord({
			code: failure.code,
			message: failure.message,
			requestId,
			retryable: failure.retryable,
			...(failure.details === undefined ? {} : { details: failure.details }),
		}),
	})
	return createRestJsonResponse(body, failure.status)
}

/** Creates one REST-owned static routing or negotiation failure. */
export const createRestResponseFailure = (
	code: RestResponseErrorCode,
	requestId: string,
): Response =>
	createRestErrorResponse(
		immutableRecord({ code, retryable: false, ...responseContracts[code] }),
		requestId,
	)

/** Maps one post-dispatch failure without serializing its diagnostic cause. */
export const createRestCaughtErrorResponse = (
	error: unknown,
	requestId: string,
	options: Readonly<{
		route?: RestPluginErrorRoute
		statusFor: (operation: string, code: string) => number | undefined
	}>,
): Response =>
	createRestErrorResponse(
		caughtFailure(error, options.route, options.statusFor),
		requestId,
	)
