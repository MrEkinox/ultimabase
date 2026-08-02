import type { SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryFieldName,
	QueryOrderingNode,
	QueryOrderNode,
} from '../ast/contracts.js'
import {
	normalizeQueryOrdering,
	type QueryOrderInput,
} from '../clauses/ordering.js'

/**
 * Makes keyset ordering total by placing the unique framework identifier last.
 */
export const normalizeQueryCursorOrdering = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	orders: readonly QueryOrderInput<QueryFieldName<TSchema>>[],
): QueryOrderingNode<QueryFieldName<TSchema>> => {
	const normalized = normalizeQueryOrdering(schema, orders)
	// Every SchemaDefinition contains the framework-owned id field by contract.
	const primaryKeyName = 'id' as QueryFieldName<TSchema>
	const primaryKeyOrder = normalized.orders.find(
		(order) => order.field === primaryKeyName,
	)
	const primaryKeyDirection =
		primaryKeyOrder?.direction ??
		normalized.orders.at(-1)?.direction ??
		'ascending'
	const stableOrders: QueryOrderNode<QueryFieldName<TSchema>>[] =
		normalized.orders.filter((order) => order.field !== primaryKeyName)

	stableOrders.push(
		immutableRecord({
			kind: 'order',
			field: primaryKeyName,
			direction: primaryKeyDirection,
		}),
	)

	return immutableRecord({
		kind: 'ordering',
		orders: immutableArray(stableOrders),
	})
}
