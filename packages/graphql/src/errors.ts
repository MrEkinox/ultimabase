// Errors as D-106 sends them, over GraphQL (D-107): a `PublicError` with its
// code and details, any other error masked and logged with its id.
import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import type { Logger } from 'ultimabase'
import { InvalidQuery, PublicError } from 'ultimabase'

/** An argument of the client's that the API refuses. */
export const badInput = (message: string): Error =>
	new PublicError('BAD_USER_INPUT', message)

/**
 * Runs a kernel query. The arguments come from the client's document, so
 * one the kernel refuses is the client's error, not the server's.
 */
export async function run<T>(query: () => Promise<T>): Promise<T> {
	try {
		return await query()
	} catch (error) {
		if (error instanceof InvalidQuery) {
			throw new PublicError('BAD_USER_INPUT', error.message, {
				details: { path: error.path },
				cause: error,
			})
		}
		throw error
	}
}

type Format = (error: Readonly<GraphQLError | Error>) => GraphQLError | Error

/** `graphql-http`'s `formatError`: what a client sees of each error. */
export function formatter(logger: Logger): Format {
	return (error) => {
		// A request `graphql-http` could not read, or a document GraphQL
		// refused: their messages are written for the client.
		if (!(error instanceof GraphQLError)) return error
		const original = error.originalError
		if (original === undefined || original instanceof GraphQLError) {
			return error
		}
		const at = { nodes: error.nodes, path: error.path }
		if (original instanceof PublicError) {
			const { code, details } = original
			return new GraphQLError(original.message, {
				...at,
				extensions: details === undefined ? { code } : { code, details },
			})
		}
		const correlationId = randomUUID()
		logger.error({ correlationId, err: original }, 'A GraphQL field failed.')
		return new GraphQLError('Internal error.', {
			...at,
			extensions: { code: 'INTERNAL', correlationId },
		})
	}
}
