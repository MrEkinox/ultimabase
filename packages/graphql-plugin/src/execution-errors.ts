import { FrameworkError, PluginError } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { GraphQLError, type GraphQLErrorExtensions } from 'graphql'

import { GraphqlInvalidCursorError } from './connection-errors.js'

interface PublicFailure {
	readonly code: string
	readonly details?: Readonly<Record<string, unknown>>
	readonly message: string
	readonly retryable: boolean
}

const internalFailure = (): PublicFailure => ({
	code: 'INTERNAL_SERVER_ERROR',
	message: 'Unexpected error.',
	retryable: false,
})

const safeDetails = (
	value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined => {
	if (value === undefined) return undefined
	try {
		const serialized = JSON.stringify(value)
		const parsed: unknown = JSON.parse(serialized)
		return isPlainRecord(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

const publicErrorFailure = (
	error: FrameworkError | PluginError,
): PublicFailure => {
	const payload = error.toJSON()
	if (payload.message === undefined) return internalFailure()
	const details = safeDetails(payload.details)
	if (payload.details !== undefined && details === undefined) {
		return internalFailure()
	}
	return {
		code: payload.code,
		message: payload.message,
		retryable: payload.retryable,
		...(details === undefined ? {} : { details }),
	}
}

const failureFor = (error: unknown): PublicFailure => {
	if (error instanceof GraphqlInvalidCursorError) {
		return {
			code: error.code,
			message: error.message,
			retryable: false,
		}
	}
	if (error instanceof FrameworkError || error instanceof PluginError) {
		return publicErrorFailure(error)
	}
	return internalFailure()
}

/** Masks one generated resolver failure behind GraphQL's public error contract. */
export const createSafeGraphqlError = (
	error: unknown,
	requestId: string,
): GraphQLError => {
	const failure = failureFor(error)
	const extensions: GraphQLErrorExtensions = {
		code: failure.code,
		requestId,
		retryable: failure.retryable,
		...(failure.details === undefined ? {} : { details: failure.details }),
	}
	return new GraphQLError(failure.message, { extensions })
}
