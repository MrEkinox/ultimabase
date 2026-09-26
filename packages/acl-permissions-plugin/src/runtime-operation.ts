import {
	getOperationSchema,
	Schema,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'

/** Reads the exact application schema retained by a normalized operation. */
export const readOperationSchema = (
	operation: RuntimeLogicalOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Runtime operation schema node is invalid')
	}
	return schema
}
