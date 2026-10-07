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

/** @internal Shares the stable safe issue shape without retaining diagnostics. */
export abstract class RestNormalizationError<
	TCode extends string,
> extends Error {
	readonly code: TCode
	readonly issue: Readonly<{ readonly code: TCode; readonly message: string }>

	protected constructor(code: TCode, boundary: string, name: string) {
		// Size and media failures share one message; malformed input names its boundary.
		const message = code.endsWith('_BODY_TOO_LARGE')
			? 'The REST request body is too large.'
			: code.endsWith('_UNSUPPORTED_MEDIA_TYPE')
				? 'The REST request media type is unsupported.'
				: `The REST ${boundary} request is malformed.`
		super(message)
		this.name = name
		this.code = code
		this.issue = immutableRecord({ code, message })
	}
}

/** Carries one stable safe parsing issue without retaining internal diagnostics. */
export class RestReadNormalizationError extends RestNormalizationError<RestReadErrorCode> {
	constructor(code: RestReadErrorCode) {
		super(code, 'read', 'RestReadNormalizationError')
	}
}

/** Carries one stable safe mutation parsing issue without internal diagnostics. */
export class RestMutationNormalizationError extends RestNormalizationError<RestMutationErrorCode> {
	constructor(code: RestMutationErrorCode) {
		super(code, 'mutation', 'RestMutationNormalizationError')
	}
}

/** Reports a safe failure while normalizing one plugin-operation request. */
export class RestOperationNormalizationError extends RestNormalizationError<RestOperationErrorCode> {
	constructor(code: RestOperationErrorCode) {
		super(code, 'operation', 'RestOperationNormalizationError')
	}
}

export const invalidRestRead: RestFailure = (reason = 'invalidInput') =>
	new RestReadNormalizationError(restReadErrorCodes[reason])

export const invalidRestMutation: RestFailure = (reason = 'invalidInput') =>
	new RestMutationNormalizationError(restMutationErrorCodes[reason])

export const invalidRestOperation: RestFailure = (reason = 'invalidInput') =>
	new RestOperationNormalizationError(restOperationErrorCodes[reason])
