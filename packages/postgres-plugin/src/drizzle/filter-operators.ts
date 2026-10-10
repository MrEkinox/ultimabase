import {
	databaseFilterOperatorCapabilityVersion,
	type DatabaseFilterOperatorCapability,
	type QueryBuiltInFilterOperator,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

const equality = [
	'equal',
	'not-equal',
	'in',
	'not-in',
	'null',
] as const satisfies readonly QueryBuiltInFilterOperator[]
const ordered = [
	...equality,
	'greater-than',
	'greater-than-or-equal',
	'less-than',
	'less-than-or-equal',
	'between',
	'not-between',
] as const satisfies readonly QueryBuiltInFilterOperator[]
const structural = [
	'contains',
	'has-key',
	'has-any-keys',
	'has-all-keys',
	'null',
] as const satisfies readonly QueryBuiltInFilterOperator[]

/** Declares every built-in operator PostgreSQL executes, per field family (ADR-0301). */
export const postgresFilterOperatorCapability: DatabaseFilterOperatorCapability =
	immutableRecord({
		kind: 'filter-operators',
		version: databaseFilterOperatorCapabilityVersion,
		families: immutableRecord({
			bigint: immutableArray(ordered),
			binary: immutableArray(equality),
			boolean: immutableArray(equality),
			date: immutableArray(ordered),
			dateTime: immutableArray(ordered),
			decimal: immutableArray(ordered),
			enum: immutableArray(equality),
			float: immutableArray(ordered),
			int: immutableArray(ordered),
			json: immutableArray([...equality, ...structural]),
			object: immutableArray(structural),
			pointer: immutableArray(equality),
			string: immutableArray([
				...ordered,
				'contains',
				'starts-with',
				'ends-with',
				'regex',
			]),
			time: immutableArray(ordered),
			uuid: immutableArray(equality),
			list: immutableArray([
				'equal',
				'not-equal',
				'list-has',
				'list-has-some',
				'list-has-every',
				'list-empty',
				'null',
			]),
		}),
	})
