import { immutableRecord } from '@ultimabase/shared'

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

const safeMessages: Readonly<Record<RestOperationErrorCode, string>> =
	immutableRecord({
		REST_OPERATION_BODY_TOO_LARGE: 'The REST request body is too large.',
		REST_OPERATION_INVALID_INPUT: 'The REST operation request is malformed.',
		REST_OPERATION_UNSUPPORTED_MEDIA_TYPE:
			'The REST request media type is unsupported.',
	})

/** Reports a safe failure while normalizing one plugin-operation request. */
export class RestOperationNormalizationError extends Error {
	readonly code: RestOperationErrorCode
	readonly issue: Readonly<{
		readonly code: RestOperationErrorCode
		readonly message: string
	}>

	constructor(code: RestOperationErrorCode) {
		const message = safeMessages[code]
		super(message)
		this.name = 'RestOperationNormalizationError'
		this.code = code
		this.issue = immutableRecord({ code, message })
	}
}

export const invalidRestOperation = (): RestOperationNormalizationError =>
	new RestOperationNormalizationError(restOperationErrorCodes.invalidInput)
