import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	QueryFieldName,
	QueryOrderingNode,
	QueryOrderDirection,
	QueryOrderNode,
} from '../ast/contracts.js'
import {
	assertQuerySchemaReference,
	parsePersistedQueryFieldName,
} from '../ast/schema.js'

/** Describes one caller-owned order request before AST normalization. */
export interface QueryOrderInput<TFieldName extends string = string> {
	readonly field: TFieldName
	readonly direction: QueryOrderDirection
}

/** Shares the only ordering node that contains no schema-specific names. */
export const emptyQueryOrdering: QueryOrderingNode<never> = immutableRecord({
	kind: 'ordering',
	orders: immutableArray([]),
})

const assertQueryOrderDirection: (
	direction: unknown,
	path: string,
) => asserts direction is QueryOrderDirection = (direction, path) => {
	if (direction !== 'ascending' && direction !== 'descending') {
		throw new TypeError(`${path} must be ascending or descending`)
	}
}

/** Keeps first field priority while letting the latest direction replace duplicates. */
export const normalizeQueryOrdering = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	orders: readonly QueryOrderInput<QueryFieldName<TSchema>>[],
): QueryOrderingNode<QueryFieldName<TSchema>> => {
	const untrustedSchema: unknown = schema
	const untrustedOrders: unknown = orders

	assertQuerySchemaReference(untrustedSchema)

	if (!isUnknownArray(untrustedOrders)) {
		throw new TypeError('query orders must be an array')
	}

	if (untrustedOrders.length === 0) {
		return emptyQueryOrdering
	}

	const normalizedOrders = new Map<
		string,
		QueryOrderNode<QueryFieldName<TSchema>>
	>()

	for (const [index, order] of untrustedOrders.entries()) {
		if (!isPlainRecord(order)) {
			throw new TypeError(`query.orders[${String(index)}] must be an object`)
		}

		const fieldName = parsePersistedQueryFieldName(
			schema,
			order.field,
			`query.orders[${String(index)}].field`,
		)
		assertQueryOrderDirection(
			order.direction,
			`query.orders[${String(index)}].direction`,
		)

		const normalizedOrder: QueryOrderNode<QueryFieldName<TSchema>> =
			immutableRecord({
				kind: 'order',
				field: fieldName,
				direction: order.direction,
			})
		// Replacing a value retains the field's first ordering priority.
		normalizedOrders.set(fieldName, normalizedOrder)
	}

	return immutableRecord({
		kind: 'ordering',
		orders: immutableArray([...normalizedOrders.values()]),
	})
}
