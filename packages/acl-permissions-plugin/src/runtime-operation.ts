import {
	getOperationSchema,
	Schema,
	type DatabaseOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'

/** Reads the exact application schema retained by a normalized operation. */
export const readOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Runtime operation schema node is invalid')
	}
	return schema
}
