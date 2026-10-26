// Errors as D-106 sends them, with GraphQL's codes (D-107, D-129).
import { InvalidQuery, PublicError } from 'ultimabase'

/** A parameter or a body of the client's that the API refuses. */
export const badInput = (message: string, cause?: unknown): Error =>
	new PublicError('BAD_USER_INPUT', message, { cause })

/**
 * Runs a kernel query. The arguments come from the client's request, so
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
