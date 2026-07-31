import type { SchemaDefinition } from '@ultimabase/schema'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	InitialQueryAst,
	QueryOrderingNode,
	QuerySchemaNode,
	QuerySelectionNode,
} from './contracts.js'

const emptySelection: QuerySelectionNode<never> = immutableRecord({
	kind: 'selection',
	fields: immutableArray([]),
})

const emptyOrdering: QueryOrderingNode<never> = immutableRecord({
	kind: 'ordering',
	orders: immutableArray([]),
})

const assertSchemaReference: (
	schema: unknown,
) => asserts schema is SchemaDefinition = (schema) => {
	if (!isPlainRecord(schema)) {
		throw new TypeError('query schema must be a schema definition')
	}

	assertNonEmptyString(schema.className, 'query schema className')
}

/** Creates the immutable neutral state from which Query builders will branch. */
export const createQueryAst = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
): InitialQueryAst<TSchema> => {
	const untrustedSchema: unknown = schema

	assertSchemaReference(untrustedSchema)

	const schemaNode: QuerySchemaNode<TSchema> = immutableRecord({
		kind: 'schema',
		definition: schema,
	})

	// Empty clause nodes are immutable and safely shared by every initial query.
	return immutableRecord({
		kind: 'query',
		schema: schemaNode,
		selection: emptySelection,
		where: undefined,
		ordering: emptyOrdering,
		pagination: undefined,
	})
}
