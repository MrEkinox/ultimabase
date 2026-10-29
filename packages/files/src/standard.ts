// Standard Schema (standardschema.dev), the part this package reads. Its
// specification asks for the interface to be copied, not imported.
export interface StandardSchema<I = unknown, O = I> {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (
			value: unknown,
		) => SchemaResult<O> | Promise<SchemaResult<O>>
		readonly types?: { readonly input: I; readonly output: O } | undefined
	}
}
type SchemaResult<O> =
	| { readonly value: O; readonly issues?: undefined }
	| { readonly issues: readonly { readonly message: string }[] }
