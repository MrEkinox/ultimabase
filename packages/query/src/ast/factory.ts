import type { SchemaDefinition } from '@ultimabase/schema'
import { immutableRecord } from '@ultimabase/shared'

import { emptyQueryOrdering } from '../clauses/ordering.js'
import { emptyQuerySelection } from '../clauses/selection.js'
import type { InitialQueryAst, QuerySchemaNode } from './contracts.js'
import { assertQuerySchemaReference } from './schema.js'

/** Creates the immutable neutral state from which Query builders will branch. */
export const createQueryAst = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
): InitialQueryAst<TSchema> => {
	const untrustedSchema: unknown = schema

	assertQuerySchemaReference(untrustedSchema)

	const schemaNode: QuerySchemaNode<TSchema> = immutableRecord({
		kind: 'schema',
		definition: schema,
	})

	// Empty clause nodes are immutable and safely shared by every initial query.
	return immutableRecord({
		kind: 'query',
		schema: schemaNode,
		selection: emptyQuerySelection,
		where: undefined,
		ordering: emptyQueryOrdering,
		pagination: undefined,
	})
}
