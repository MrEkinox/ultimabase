/** Reports one opaque cursor failure without exposing verification details. */
export class GraphqlInvalidCursorError extends Error {
	readonly code = 'GRAPHQL_INVALID_CURSOR' as const

	constructor() {
		super('Invalid GraphQL cursor.')
		this.name = 'GraphqlInvalidCursorError'
		Object.freeze(this)
	}
}
