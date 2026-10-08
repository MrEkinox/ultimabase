import { immutableRecord } from '@ultimabase/shared'

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

/** Creates one boundary-specific safe failure; omission means malformed input. */
export type RestFailure = (reason?: RestFailureReason) => Error

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

	constructor(code: RestReadErrorCode) {
		const message = safeMessage(code, 'read')
		super(message)
		this.name = 'RestReadNormalizationError'
		this.code = code
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

	constructor(code: RestMutationErrorCode) {
		const message = safeMessage(code, 'mutation')
		super(message)
		this.name = 'RestMutationNormalizationError'
		this.code = code
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

	constructor(code: RestOperationErrorCode) {
		const message = safeMessage(code, 'operation')
		super(message)
		this.name = 'RestOperationNormalizationError'
		this.code = code
		this.issue = immutableRecord({ code, message })
	}
}

/** Any of the three boundary-specific normalization errors. */
export type RestNormalizationError =
	| RestMutationNormalizationError
	| RestOperationNormalizationError
	| RestReadNormalizationError

export const invalidRestRead: RestFailure = (reason = 'invalidInput') =>
	new RestReadNormalizationError(restReadErrorCodes[reason])

export const invalidRestMutation: RestFailure = (reason = 'invalidInput') =>
	new RestMutationNormalizationError(restMutationErrorCodes[reason])

export const invalidRestOperation: RestFailure = (reason = 'invalidInput') =>
	new RestOperationNormalizationError(restOperationErrorCodes[reason])
