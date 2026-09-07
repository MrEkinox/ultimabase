import type { SchemaContributionOwner } from '@ultimabase/core'

/** Stable reasons emitted while compiling one application-local GraphQL schema. */
export type GraphqlSchemaCompilationFailureReason =
	| 'invalid-name'
	| 'missing-field-codec'
	| 'missing-query-root'
	| 'name-collision'
	| 'plugin-schema-option'

/** Reports deterministic GraphQL compilation failures before request work begins. */
export class GraphqlSchemaCompilationError extends Error {
	readonly code = 'GRAPHQL_SCHEMA_COMPILATION_FAILED' as const
	readonly reason: GraphqlSchemaCompilationFailureReason
	readonly owner: SchemaContributionOwner | undefined
	readonly path: string | undefined

	constructor(
		reason: GraphqlSchemaCompilationFailureReason,
		message: string,
		options: Readonly<{
			readonly owner?: SchemaContributionOwner
			readonly path?: string
		}> = {},
	) {
		super(message)
		this.name = 'GraphqlSchemaCompilationError'
		this.reason = reason
		this.owner = options.owner
		this.path = options.path
		Object.freeze(this)
	}
}
