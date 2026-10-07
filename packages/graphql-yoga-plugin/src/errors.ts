import { getCurrentRequest } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLError,
	type ExecutionResult,
	type GraphQLErrorOptions,
} from 'graphql'

interface GraphqlHttpFailureOptions {
	readonly code: string
	readonly message: string
	readonly status: number
}

/**
 * Carries a safe request failure through Yoga's status-aware serializer.
 * Parse and validation failures also keep their source error and locations.
 */
export const createGraphqlHttpFailure = ({
	code,
	message,
	status,
	...errorOptions
}: GraphqlHttpFailureOptions &
	Pick<GraphQLErrorOptions, 'nodes' | 'originalError'>): GraphQLError =>
	new GraphQLError(message, {
		...errorOptions,
		extensions: {
			code,
			http: { status },
			requestId: getCurrentRequest().requestId,
			retryable: false,
		},
	})

/** Produces protocol-owned failures without exposing Yoga internals. */
export const createGraphqlHttpFailureResponse = (
	options: GraphqlHttpFailureOptions &
		Readonly<{ readonly allow?: string; readonly mediaType?: string }>,
): Response => {
	const requestId = getCurrentRequest().requestId
	const headers = new Headers({
		'Cache-Control': 'no-store',
		'Content-Type': `${options.mediaType ?? 'application/graphql-response+json'}; charset=utf-8`,
	})
	if (options.allow !== undefined) headers.set('Allow', options.allow)
	return new Response(
		JSON.stringify({
			errors: [
				{
					extensions: {
						code: options.code,
						requestId,
						retryable: false,
					},
					message: options.message,
				},
			],
		}),
		{ headers, status: options.status },
	)
}

const safeDetails = (
	value: unknown,
): Readonly<Record<string, unknown>> | undefined => {
	if (!isPlainRecord(value)) return undefined
	try {
		const parsed: unknown = JSON.parse(JSON.stringify(value))
		return isPlainRecord(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

const sanitizeGraphqlError = (
	error: GraphQLError,
	status: number,
): GraphQLError => {
	const requestId = getCurrentRequest().requestId
	const rawCode = error.extensions.code
	const code =
		typeof rawCode === 'string'
			? rawCode
			: status === 400
				? 'BAD_USER_INPUT'
				: 'INTERNAL_SERVER_ERROR'
	const details = safeDetails(error.extensions.details)
	return new GraphQLError(error.message, {
		extensions: {
			code,
			...(details === undefined ? {} : { details }),
			http: { status },
			requestId,
			retryable:
				typeof error.extensions.retryable === 'boolean'
					? error.extensions.retryable
					: false,
		},
		nodes: error.nodes,
		path: error.path,
	})
}

/** Adds one public error shape and the correct GraphQL-over-HTTP status. */
export const sanitizeGraphqlExecutionResult = (
	result: ExecutionResult,
): ExecutionResult => {
	if (result.errors === undefined || result.errors.length === 0) return result
	const isRequestFailure = !Object.hasOwn(result, 'data')
	const internalOnly = result.errors.every(
		(error) => error.extensions.code === 'INTERNAL_SERVER_ERROR',
	)
	const status = isRequestFailure ? (internalOnly ? 500 : 400) : 200
	return {
		...result,
		errors: result.errors.map((error) => sanitizeGraphqlError(error, status)),
	}
}
