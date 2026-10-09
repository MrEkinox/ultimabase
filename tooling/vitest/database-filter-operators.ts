import {
	databaseFilterOperatorCapabilityVersion,
	type DatabaseFilterOperatorCapability,
	type QueryBuiltInFilterOperator,
} from '@ultimabase/core'

const equality: readonly QueryBuiltInFilterOperator[] = [
	'equal',
	'not-equal',
	'in',
	'not-in',
	'null',
]
const ordered: readonly QueryBuiltInFilterOperator[] = [
	...equality,
	'greater-than',
	'greater-than-or-equal',
	'less-than',
	'less-than-or-equal',
	'between',
	'not-between',
]
const listOperators: readonly QueryBuiltInFilterOperator[] = [
	'equal',
	'not-equal',
	'list-has',
	'list-has-some',
	'list-has-every',
	'list-empty',
	'null',
]
const stringOperators: readonly QueryBuiltInFilterOperator[] = [
	...ordered,
	'contains',
	'starts-with',
	'ends-with',
	'regex',
]
const structural: readonly QueryBuiltInFilterOperator[] = [
	'contains',
	'has-key',
	'has-any-keys',
	'has-all-keys',
	'null',
]

/**
 * Declares every built-in filter operator for fake adapters (ADR-0301), the
 * same table the PostgreSQL adapter declares.
 */
export const testDatabaseFilterOperators: DatabaseFilterOperatorCapability =
	Object.freeze({
		kind: 'filter-operators',
		version: databaseFilterOperatorCapabilityVersion,
		families: Object.freeze({
			bigint: ordered,
			binary: equality,
			boolean: equality,
			date: ordered,
			dateTime: ordered,
			decimal: ordered,
			enum: equality,
			float: ordered,
			int: ordered,
			json: [...equality, ...structural],
			object: structural,
			pointer: equality,
			string: stringOperators,
			time: ordered,
			uuid: equality,
			list: listOperators,
		}),
	})
