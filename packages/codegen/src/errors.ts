/** Identifies stable schema-generation failure categories for future CLI diagnostics. */
export type SchemaTypegenFailureReason =
	| 'generated-identity-conflict'
	| 'invalid-application-export'
	| 'malformed-plugin-contribution'
	| 'output-path-conflict'
	| 'unsupported-field-kind'

export interface SchemaTypegenErrorOptions extends ErrorOptions {
	readonly owner?: string
	readonly path?: string
}

/** Reports one deterministic generation failure without leaking runtime state. */
export class SchemaTypegenError extends Error {
	readonly code = 'SCHEMA_TYPEGEN_FAILED' as const
	readonly reason: SchemaTypegenFailureReason
	readonly owner: string | undefined
	readonly path: string | undefined

	constructor(
		reason: SchemaTypegenFailureReason,
		message: string,
		options: SchemaTypegenErrorOptions = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'SchemaTypegenError'
		this.reason = reason
		this.owner = options.owner
		this.path = options.path
		Object.freeze(this)
	}
}
