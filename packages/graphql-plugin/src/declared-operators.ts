import {
	getFieldListDepth,
	type DatabaseFilterOperatorCapability,
	type DatabaseFilterOperatorFamily,
	type GenericField,
} from '@ultimabase/core'
import type { GraphQLInputFieldConfigMap } from 'graphql'

const families: ReadonlySet<string> = new Set<DatabaseFilterOperatorFamily>([
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'list',
	'object',
	'pointer',
	'string',
	'time',
	'uuid',
])

const isFamily = (kind: string): kind is DatabaseFilterOperatorFamily =>
	families.has(kind)

// The `where` key of every portable operator, as Core reads it.
const operatorKinds: Readonly<Record<string, string>> = {
	between: 'between',
	contains: 'contains',
	endsWith: 'ends-with',
	eq: 'equal',
	gt: 'greater-than',
	gte: 'greater-than-or-equal',
	has: 'list-has',
	hasAllKeys: 'has-all-keys',
	hasAnyKeys: 'has-any-keys',
	hasEvery: 'list-has-every',
	hasKey: 'has-key',
	hasSome: 'list-has-some',
	in: 'in',
	isEmpty: 'list-empty',
	isNotNull: 'null',
	isNull: 'null',
	lt: 'less-than',
	lte: 'less-than-or-equal',
	matches: 'regex',
	ne: 'not-equal',
	notBetween: 'not-between',
	notIn: 'not-in',
	startsWith: 'starts-with',
}

/**
 * The operator family of one field as Core reads it: `list` for any list,
 * its kind for a built-in field; plugin and relation fields keep their own
 * capabilities. `undefined` (an unstructured path) is JSON.
 */
export const readGraphqlOperatorFamily = (
	field: GenericField | undefined,
): DatabaseFilterOperatorFamily | undefined => {
	if (field === undefined) return 'json'
	if (getFieldListDepth(field.options) > 0) return 'list'
	return isFamily(field.kind) ? field.kind : undefined
}

/**
 * Lists the operators the adapter declares for one family, or `undefined`
 * when no adapter declared any statically: GraphQL then keeps every operator
 * and Core still rejects an undeclared one at request time.
 */
export const readDeclaredGraphqlOperators = (
	declaration: DatabaseFilterOperatorCapability | undefined,
	family: DatabaseFilterOperatorFamily | undefined,
): ReadonlySet<string> | undefined =>
	declaration === undefined || family === undefined
		? undefined
		: new Set(declaration.families[family] ?? [])

/**
 * Keeps the filter fields whose operator the adapter declares (ADR-0301
 * decision 5, ADR-0325); fields that are not operators stay.
 */
export const narrowGraphqlOperators = (
	fields: GraphQLInputFieldConfigMap,
	declared: ReadonlySet<string> | undefined,
): GraphQLInputFieldConfigMap =>
	declared === undefined
		? fields
		: Object.fromEntries(
				Object.entries(fields).filter(([key]) => {
					const kind = operatorKinds[key]
					return kind === undefined || declared.has(kind)
				}),
			)
