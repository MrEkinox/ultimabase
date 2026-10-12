import { immutableArray, immutableRecord } from '@ultimabase/shared'

export const restReadErrorCodes: Readonly<{
	readonly bodyTooLarge: 'REST_READ_BODY_TOO_LARGE'
	readonly invalidInput: 'REST_READ_INVALID_INPUT'
	readonly unsupportedMediaType: 'REST_READ_UNSUPPORTED_MEDIA_TYPE'
}> = immutableRecord({
	bodyTooLarge: 'REST_READ_BODY_TOO_LARGE',
	invalidInput: 'REST_READ_INVALID_INPUT',
	unsupportedMediaType: 'REST_READ_UNSUPPORTED_MEDIA_TYPE',
} as const)

export type RestReadErrorCode =
	(typeof restReadErrorCodes)[keyof typeof restReadErrorCodes]

export const restMutationErrorCodes: Readonly<{
	readonly bodyTooLarge: 'REST_MUTATION_BODY_TOO_LARGE'
	readonly invalidInput: 'REST_MUTATION_INVALID_INPUT'
	readonly unsupportedMediaType: 'REST_MUTATION_UNSUPPORTED_MEDIA_TYPE'
}> = immutableRecord({
	bodyTooLarge: 'REST_MUTATION_BODY_TOO_LARGE',
	invalidInput: 'REST_MUTATION_INVALID_INPUT',
	unsupportedMediaType: 'REST_MUTATION_UNSUPPORTED_MEDIA_TYPE',
} as const)

export type RestMutationErrorCode =
	(typeof restMutationErrorCodes)[keyof typeof restMutationErrorCodes]

export const restOperationErrorCodes: Readonly<{
	readonly bodyTooLarge: 'REST_OPERATION_BODY_TOO_LARGE'
	readonly invalidInput: 'REST_OPERATION_INVALID_INPUT'
	readonly unsupportedMediaType: 'REST_OPERATION_UNSUPPORTED_MEDIA_TYPE'
}> = immutableRecord({
	bodyTooLarge: 'REST_OPERATION_BODY_TOO_LARGE',
	invalidInput: 'REST_OPERATION_INVALID_INPUT',
	unsupportedMediaType: 'REST_OPERATION_UNSUPPORTED_MEDIA_TYPE',
} as const)

export type RestOperationErrorCode =
	(typeof restOperationErrorCodes)[keyof typeof restOperationErrorCodes]

/** Names the three safe failures every REST request boundary can report. */
export type RestFailureReason = keyof typeof restReadErrorCodes

/**
 * Locates one client error (ADR-0324): the request `parameter` (`where`,
 * `take`, `body`…), the `path` inside it and the `reason` in words.
 *
 * @example `{ parameter: 'where', path: ['createdAt', 'gt'], reason: 'must be an ISO 8601 date-time string' }`
 */
export interface RestErrorDetails {
	readonly parameter: string
	readonly path: readonly (number | string)[]
	readonly reason: string
}

/** Creates one boundary-specific safe failure; omission means malformed input. */
export type RestFailure = (
	reason?: RestFailureReason,
	details?: RestErrorDetails,
) => Error

/** @internal Snapshots one details record for a normalization error. */
export const restErrorDetails = (
	parameter: string,
	reason: string,
	path: readonly (number | string)[] = [],
): RestErrorDetails =>
	immutableRecord({ parameter, path: immutableArray([...path]), reason })

/**
 * Derives the safe message from the code suffix: size and media failures share
 * one message, malformed input names its boundary.
 */
const safeMessage = (code: string, boundary: string): string =>
	code.endsWith('_BODY_TOO_LARGE')
		? 'The REST request body is too large.'
		: code.endsWith('_UNSUPPORTED_MEDIA_TYPE')
			? 'The REST request media type is unsupported.'
			: `The REST ${boundary} request is malformed.`

// Each class declares its own `code` and `issue` (no shared generic base) so
// editor hovers name the concrete class and code union, as in the reference.

/** Carries one stable safe parsing issue without retaining internal diagnostics. */
export class RestReadNormalizationError extends Error {
	readonly code: RestReadErrorCode
	readonly issue: Readonly<{
		readonly code: RestReadErrorCode
		readonly message: string
	}>

	/** Where the request is wrong, when known (ADR-0324). */
	readonly details: RestErrorDetails | undefined

	constructor(code: RestReadErrorCode, details?: RestErrorDetails) {
		const message = safeMessage(code, 'read')
		super(message)
		this.name = 'RestReadNormalizationError'
		this.code = code
		this.details = details
		this.issue = immutableRecord({ code, message })
	}
}

/** Carries one stable safe mutation parsing issue without internal diagnostics. */
export class RestMutationNormalizationError extends Error {
	readonly code: RestMutationErrorCode
	readonly issue: Readonly<{
		readonly code: RestMutationErrorCode
		readonly message: string
	}>

	/** Where the request is wrong, when known (ADR-0324). */
	readonly details: RestErrorDetails | undefined

	constructor(code: RestMutationErrorCode, details?: RestErrorDetails) {
		const message = safeMessage(code, 'mutation')
		super(message)
		this.name = 'RestMutationNormalizationError'
		this.code = code
		this.details = details
		this.issue = immutableRecord({ code, message })
	}
}

/** Reports a safe failure while normalizing one plugin-operation request. */
export class RestOperationNormalizationError extends Error {
	readonly code: RestOperationErrorCode
	readonly issue: Readonly<{
		readonly code: RestOperationErrorCode
		readonly message: string
	}>

	/** Where the request is wrong, when known (ADR-0324). */
	readonly details: RestErrorDetails | undefined

	constructor(code: RestOperationErrorCode, details?: RestErrorDetails) {
		const message = safeMessage(code, 'operation')
		super(message)
		this.name = 'RestOperationNormalizationError'
		this.code = code
		this.details = details
		this.issue = immutableRecord({ code, message })
	}
}

/** Any of the three boundary-specific normalization errors. */
export type RestNormalizationError =
	| RestMutationNormalizationError
	| RestOperationNormalizationError
	| RestReadNormalizationError

export const invalidRestRead: RestFailure = (
	reason = 'invalidInput',
	details,
) => new RestReadNormalizationError(restReadErrorCodes[reason], details)

export const invalidRestMutation: RestFailure = (
	reason = 'invalidInput',
	details,
) => new RestMutationNormalizationError(restMutationErrorCodes[reason], details)

export const invalidRestOperation: RestFailure = (
	reason = 'invalidInput',
	details,
) =>
	new RestOperationNormalizationError(restOperationErrorCodes[reason], details)

/** Reads the details of a normalization error, if it carries any. */
export const readRestErrorDetails = (
	error: unknown,
): RestErrorDetails | undefined =>
	error instanceof RestReadNormalizationError ||
	error instanceof RestMutationNormalizationError ||
	error instanceof RestOperationNormalizationError
		? error.details
		: undefined

/** Narrows the three REST normalization errors. */
export const isRestNormalizationError = (
	error: unknown,
): error is RestNormalizationError =>
	error instanceof RestReadNormalizationError ||
	error instanceof RestMutationNormalizationError ||
	error instanceof RestOperationNormalizationError

const failureReason = (code: string): RestFailureReason =>
	code.endsWith('_BODY_TOO_LARGE')
		? 'bodyTooLarge'
		: code.endsWith('_UNSUPPORTED_MEDIA_TYPE')
			? 'unsupportedMediaType'
			: 'invalidInput'

/**
 * Places a value failure inside one request parameter: the failure keeps its
 * path and reason and gains `parameter`; a failure without details gets
 * `reason` as its reason.
 */
export const failInParameter = (
	error: unknown,
	fail: RestFailure,
	parameter: string,
	reason = 'is invalid',
): unknown => {
	if (!isRestNormalizationError(error)) return error
	const details = error.details
	return fail(
		failureReason(error.code),
		details !== undefined && details.parameter !== ''
			? details
			: restErrorDetails(
					parameter,
					details?.reason ?? reason,
					details?.path ?? [],
				),
	)
}

/** Runs one parameter decoder, placing its failures in that parameter. */
export const decodeParameter = <TValue>(
	parameter: string,
	fail: RestFailure,
	decode: () => TValue,
	reason?: string,
): TValue => {
	try {
		return decode()
	} catch (error: unknown) {
		throw failInParameter(error, fail, parameter, reason)
	}
}

/**
 * A value failure whose parameter the caller fills in: `path` locates the
 * value inside that parameter.
 */
export const invalidRestValue = (
	reason: string,
	path: readonly (number | string)[],
): RestReadNormalizationError =>
	new RestReadNormalizationError(
		restReadErrorCodes.invalidInput,
		restErrorDetails('', reason, path),
	)
