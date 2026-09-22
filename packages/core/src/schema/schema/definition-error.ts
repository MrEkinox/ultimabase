/** Reports deferred and incompatible schema declarations without publishing partial metadata. */
/** Explains why a deferred schema cannot expose its final runtime definition. */
export type SchemaCompilationFailureReason =
	| 'callback-threw'
	| 'incompatible-definition'
	| 'invalid-result'
	| 'not-compiled'

/** Reports one deterministic static schema-compilation failure. */
export class SchemaCompilationError extends Error {
	readonly code = 'SCHEMA_COMPILATION_FAILED' as const
	readonly className: string
	readonly reason: SchemaCompilationFailureReason

	constructor(
		reason: SchemaCompilationFailureReason,
		className: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.name = 'SchemaCompilationError'
		this.className = className
		this.reason = reason
		Object.freeze(this)
	}
}
