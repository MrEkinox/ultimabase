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

const safeMessages: Readonly<Record<RestReadErrorCode, string>> =
	immutableRecord({
		REST_READ_BODY_TOO_LARGE: 'The REST request body is too large.',
		REST_READ_INVALID_INPUT: 'The REST read request is malformed.',
		REST_READ_UNSUPPORTED_MEDIA_TYPE:
			'The REST request media type is unsupported.',
	})

/** Carries one stable safe parsing issue without retaining internal diagnostics. */
export class RestReadNormalizationError extends Error {
	readonly code: RestReadErrorCode
	readonly issue: Readonly<{
		readonly code: RestReadErrorCode
		readonly message: string
	}>

	constructor(code: RestReadErrorCode) {
		const message = safeMessages[code]
		super(message)
		this.name = 'RestReadNormalizationError'
		this.code = code
		this.issue = immutableRecord({ code, message })
	}
}

export const invalidRestRead = (): RestReadNormalizationError =>
	new RestReadNormalizationError(restReadErrorCodes.invalidInput)
