import type { SchemaDefinition } from '../../schema/index.js'

import type { QueryFieldName } from '../ast/contracts.js'
import type { Query } from './query.js'

/** Transforms an unbound query while retaining its exact schema and projection. */
export type QueryScope<TSchema extends SchemaDefinition> = <
	TSelectedField extends QueryFieldName<TSchema>,
>(
	query: Query<TSchema, TSelectedField>,
) => Query<TSchema, TSelectedField>
