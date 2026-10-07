import { immutableRecord } from '@ultimabase/shared'

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

const safeMessages: Readonly<Record<RestMutationErrorCode, string>> =
	immutableRecord({
		REST_MUTATION_BODY_TOO_LARGE: 'The REST request body is too large.',
		REST_MUTATION_INVALID_INPUT: 'The REST mutation request is malformed.',
		REST_MUTATION_UNSUPPORTED_MEDIA_TYPE:
			'The REST request media type is unsupported.',
	})

/** Carries one stable safe mutation parsing issue without internal diagnostics. */
export class RestMutationNormalizationError extends Error {
	readonly code: RestMutationErrorCode
	readonly issue: Readonly<{
		readonly code: RestMutationErrorCode
		readonly message: string
	}>

	constructor(code: RestMutationErrorCode) {
		const message = safeMessages[code]
		super(message)
		this.name = 'RestMutationNormalizationError'
		this.code = code
		this.issue = immutableRecord({ code, message })
	}
}

export const invalidRestMutation = (): RestMutationNormalizationError =>
	new RestMutationNormalizationError(restMutationErrorCodes.invalidInput)
