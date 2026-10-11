import {
	FrameworkError,
	PluginError,
	PublicError,
	type Logger,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { GraphQLError, type GraphQLErrorExtensions } from 'graphql'

interface PublicFailure {
	readonly code: string
	readonly details?: Readonly<Record<string, unknown>>
	readonly message: string
	readonly retryable: boolean
}

const internalFailure: PublicFailure = {
	code: 'INTERNAL_SERVER_ERROR',
	message: 'Unexpected error.',
	retryable: false,
}

// Details survive only as an exact JSON round trip of a plain record.
const safeDetails = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined => {
	try {
		const parsed: unknown = JSON.parse(JSON.stringify(value))
		return isPlainRecord(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

// Only explicitly public Core and plugin metadata ever reaches the client.
const publicFailure = (
	error: FrameworkError | PluginError | PublicError<string>,
): PublicFailure => {
	const payload = error.toJSON()
	if (payload.message === undefined) return internalFailure
	const details =
		payload.details === undefined ? undefined : safeDetails(payload.details)
	if (payload.details !== undefined && details === undefined) {
		return internalFailure
	}
	return {
		code: payload.code,
		message: payload.message,
		retryable: payload.retryable,
		...(details === undefined ? {} : { details }),
	}
}

const failureFor = (error: unknown): PublicFailure =>
	// Application errors keep their code in `extensions.code` (ADR-0305).
	error instanceof FrameworkError ||
	error instanceof PluginError ||
	error instanceof PublicError
		? publicFailure(error)
		: internalFailure

/** Masks one generated resolver failure behind GraphQL's public error contract. */
export const createSafeGraphqlError = (
	error: unknown,
	requestId: string,
	logger: Logger,
): GraphQLError => {
	const failure = failureFor(error)
	if (failure === internalFailure) {
		// Masked failures keep their stack in server logs only (ADR-0305, ADR-0313).
		logger.error(
			`GraphQL request ${requestId} failed`,
			typeof error === 'object' && error !== null ? error : { error },
		)
	}
	const extensions: GraphQLErrorExtensions = {
		code: failure.code,
		requestId,
		retryable: failure.retryable,
		...(failure.details === undefined ? {} : { details: failure.details }),
	}
	return new GraphQLError(failure.message, { extensions })
}

/** Converts a native GraphQL abort into the same safe public cancellation shape. */
export const createCancelledGraphqlError = (requestId: string): GraphQLError =>
	new GraphQLError('The operation was cancelled.', {
		extensions: {
			code: 'OPERATION_CANCELLED',
			requestId,
			retryable: false,
		},
	})
