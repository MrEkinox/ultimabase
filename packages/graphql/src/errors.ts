// Errors as D-106 sends them, over GraphQL (D-107): a `PublicError` with its
// code and details, any other error masked and logged with its id, and
// graphql-js's own without the values they refused.
import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import type { Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'

type Format = (error: Readonly<GraphQLError | Error>) => GraphQLError | Error

/** graphql-js's message without the value it refused, a password perhaps. */
function unvalued(error: Readonly<GraphQLError>): GraphQLError {
	const { message, nodes, path, extensions } = error
	const reason = message.replace(
		/[,;]? [Ff]ound: [\s\S]*$|(?<= cannot represent [^:]*): [\s\S]*$/,
		'',
	)
	if (reason === message) return error
	const ended = /[.?]$/.test(reason) ? reason : `${reason}.`
	return new GraphQLError(ended, { nodes, path, extensions })
}

/** `graphql-http`'s `formatError`: what a client sees of each error. */
export function formatter(logger: Logger): Format {
	return (error) => {
		// A request `graphql-http` could not read, or a document GraphQL
		// refused: their messages are written for the client.
		if (!(error instanceof GraphQLError)) return error
		const original = error.originalError
		if (original === undefined || original instanceof GraphQLError) {
			return unvalued(error)
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
