import { FrameworkError, PluginError } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { RestReadNormalizationError } from './errors.js'
import { encodeRestJsonValue } from './response-values.js'
import { RestMutationNormalizationError } from './mutation-errors.js'
import { RestOperationNormalizationError } from './operation-errors.js'
import type { RestPluginOperationRouteDefinition } from './routes.js'

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
	REST_BAD_REQUEST: immutableRecord({
		message: 'The REST request is malformed.',
		status: 400,
	}),
	REST_INTERNAL_ERROR: immutableRecord({
		message: 'The REST request could not be completed.',
		status: 500,
	}),
	REST_NOT_ACCEPTABLE: immutableRecord({
		message: 'The requested REST response media type is not available.',
		status: 406,
	}),
	REST_NOT_FOUND: immutableRecord({
		message: 'The requested REST route was not found.',
		status: 404,
	}),
	REST_UNSUPPORTED_VERSION: immutableRecord({
		message: 'The requested REST protocol version is not supported.',
		status: 400,
	}),
})

const normalizationStatus = (code: string): number => {
	if (code.endsWith('_BODY_TOO_LARGE')) return 413
	if (code.endsWith('_UNSUPPORTED_MEDIA_TYPE')) return 415
	return 400
}

const frameworkStatus = (code: string): number => {
	if (code === 'PERMISSION_DENIED' || code === 'MASTER_ACCESS_DENIED') {
		return 403
	}
	if (code === 'NOT_FOUND') return 404
	if (code === 'VALIDATION_ERROR') return 422
	return 500
}

const internalFailure = (): RestPublicFailure =>
	immutableRecord({
		code: restResponseErrorCodes.internalError,
		message: responseContracts.REST_INTERNAL_ERROR.message,
		retryable: false,
		status: responseContracts.REST_INTERNAL_ERROR.status,
	})

const snapshotPublicDetails = (
	details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined => {
	if (details === undefined) return undefined
	try {
		const encoded = encodeRestJsonValue(details, () => new TypeError())
		return encoded as Readonly<Record<string, unknown>>
	} catch {
		return undefined
	}
}

const publicFailure = (
	code: string,
	message: string,
	retryable: boolean,
	status: number,
	details?: Readonly<Record<string, unknown>>,
): RestPublicFailure => {
	const safeDetails = snapshotPublicDetails(details)
	if (details !== undefined && safeDetails === undefined)
		return internalFailure()
	return immutableRecord({
		code,
		message,
		retryable,
		status,
		...(safeDetails === undefined ? {} : { details: safeDetails }),
	})
}

const normalizationFailure = (
	error:
		| RestMutationNormalizationError
		| RestOperationNormalizationError
		| RestReadNormalizationError,
): RestPublicFailure =>
	publicFailure(
		error.issue.code,
		error.issue.message,
		false,
		normalizationStatus(error.issue.code),
	)

type AnyFrameworkError = FrameworkError

type AnyPluginError = PluginError

const isFrameworkError = (error: unknown): error is AnyFrameworkError =>
	error instanceof FrameworkError

const isPluginError = (error: unknown): error is AnyPluginError =>
	error instanceof PluginError

const frameworkFailure = (error: AnyFrameworkError): RestPublicFailure => {
	const payload = error.toJSON()
	if (payload.message === undefined) return internalFailure()
	return publicFailure(
		payload.code,
		payload.message,
		payload.retryable,
		frameworkStatus(payload.code),
		payload.details,
	)
}

const pluginFailure = (
	error: AnyPluginError,
	route: RestPluginOperationRouteDefinition | undefined,
	statusFor: (operation: string, code: string) => number | undefined,
): RestPublicFailure => {
	const payload = error.toJSON()
	const status =
		route === undefined ? undefined : statusFor(route.operation, payload.code)
	if (payload.message === undefined || status === undefined) {
		return internalFailure()
	}
	return publicFailure(
		payload.code,
		payload.message,
		payload.retryable,
		status,
		payload.details,
	)
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

/** Creates one REST-owned static routing or negotiation failure. */
export const createRestResponseFailure = (
	code: RestResponseErrorCode,
	requestId: string,
): Response => {
	const contract = responseContracts[code]
	return createRestErrorResponse(
		immutableRecord({
			code,
			message: contract.message,
			retryable: false,
			status: contract.status,
		}),
		requestId,
	)
}

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

/** Maps one post-dispatch failure without serializing its diagnostic cause. */
export const createRestCaughtErrorResponse = (
	error: unknown,
	requestId: string,
	options: Readonly<{
		route?: RestPluginOperationRouteDefinition
		statusFor: (operation: string, code: string) => number | undefined
	}>,
): Response => {
	const failure =
		error instanceof RestReadNormalizationError ||
		error instanceof RestMutationNormalizationError ||
		error instanceof RestOperationNormalizationError
			? normalizationFailure(error)
			: isFrameworkError(error)
				? frameworkFailure(error)
				: isPluginError(error)
					? pluginFailure(error, options.route, options.statusFor)
					: internalFailure()
	return createRestErrorResponse(failure, requestId)
}
