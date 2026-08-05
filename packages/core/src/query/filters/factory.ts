import {
	snapshotScalarFieldValue,
	type FieldDefinition,
	type SchemaDefinition,
} from '../../schema/index.js'
import { isFieldNullable } from '../../schema/fields/base/options.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import { parseQueryFieldName } from '../ast/schema.js'
import {
	queryEqualityFieldKinds,
	queryOrderedFieldKinds,
	type QueryComparisonFilterOperator,
	type QueryEqualityFilterOperator,
	type QueryMembershipFilterOperator,
	type QueryPrimitiveFilterNode,
	type QueryRangeFilterOperator,
	type QueryRegexFlag,
	type QueryRegexPattern,
	type QueryStringFilterOperator,
} from './primitive.js'

const regexFlags: readonly QueryRegexFlag[] = [
	'case-insensitive',
	'dot-matches-newline',
	'multiline',
]

type RuntimeQueryField = FieldDefinition<string, unknown, object>

const includesString = (values: readonly string[], value: string): boolean =>
	values.some((candidate) => candidate === value)

const hasListShape = (field: RuntimeQueryField): boolean =>
	'list' in field.options &&
	field.options.list !== false &&
	field.options.list !== undefined

const resolveQueryField = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	fieldName: TFieldName,
): readonly [TFieldName, RuntimeQueryField] => {
	const normalizedFieldName = parseQueryFieldName(
		schema,
		fieldName,
		'query filter field',
	)
	const field: RuntimeQueryField | undefined =
		schema.fields[normalizedFieldName]

	if (field === undefined) {
		throw new TypeError('query filter field must reference a field definition')
	}

	return [fieldName, field]
}

const assertOperatorSupport = (
	field: RuntimeQueryField,
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryMembershipFilterOperator
		| QueryRangeFilterOperator
		| QueryStringFilterOperator
		| 'null'
		| 'regex',
): void => {
	if (operator === 'null') {
		return
	}

	if (hasListShape(field)) {
		throw new TypeError(
			`query operator ${operator} does not support list fields`,
		)
	}

	const supported =
		operator === 'equal' ||
		operator === 'not-equal' ||
		operator === 'in' ||
		operator === 'not-in'
			? includesString(queryEqualityFieldKinds, field.kind)
			: operator === 'greater-than' ||
				  operator === 'greater-than-or-equal' ||
				  operator === 'less-than' ||
				  operator === 'less-than-or-equal' ||
				  operator === 'between' ||
				  operator === 'not-between'
				? includesString(queryOrderedFieldKinds, field.kind)
				: field.kind === 'string'

	if (!supported) {
		throw new TypeError(
			`query operator ${operator} does not support ${field.kind} fields`,
		)
	}
}

const snapshotQueryValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null && isFieldNullable(field)) {
		return null
	}

	return snapshotScalarFieldValue(field, value, path)
}

const snapshotQueryNonNullValue = (
	field: RuntimeQueryField,
	value: unknown,
	path: string,
): unknown => {
	if (value === null) {
		throw new TypeError(`${path} must not be null`)
	}

	return snapshotScalarFieldValue(field, value, path)
}

const isNullableValueOperator = (
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryStringFilterOperator,
): operator is QueryEqualityFilterOperator =>
	operator === 'equal' || operator === 'not-equal'

const isQueryRegexFlag = (value: unknown): value is QueryRegexFlag =>
	typeof value === 'string' && includesString(regexFlags, value)

/** Creates one immutable scalar value filter after checking runtime capabilities. */
export const createQueryValueFilter = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryStringFilterOperator,
	fieldName: TFieldName,
	value: unknown,
): QueryPrimitiveFilterNode<TSchema, TFieldName> => {
	const [normalizedFieldName, field] = resolveQueryField(schema, fieldName)

	assertOperatorSupport(field, operator)

	return immutableRecord({
		kind: operator,
		field: normalizedFieldName,
		value: isNullableValueOperator(operator)
			? snapshotQueryValue(field, value, 'query filter value')
			: snapshotQueryNonNullValue(field, value, 'query filter value'),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Creates one immutable inclusive range filter with two non-null bounds. */
export const createQueryRangeFilter = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	operator: QueryRangeFilterOperator,
	fieldName: TFieldName,
	lower: unknown,
	upper: unknown,
): QueryPrimitiveFilterNode<TSchema, TFieldName> => {
	const [normalizedFieldName, field] = resolveQueryField(schema, fieldName)

	assertOperatorSupport(field, operator)

	return immutableRecord({
		kind: operator,
		field: normalizedFieldName,
		lower: snapshotQueryNonNullValue(field, lower, 'query range lower bound'),
		upper: snapshotQueryNonNullValue(field, upper, 'query range upper bound'),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Copies membership operands so later caller mutations cannot change a query. */
export const createQueryMembershipFilter = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	operator: QueryMembershipFilterOperator,
	fieldName: TFieldName,
	values: readonly unknown[],
): QueryPrimitiveFilterNode<TSchema, TFieldName> => {
	const [normalizedFieldName, field] = resolveQueryField(schema, fieldName)
	const untrustedValues: unknown = values

	assertOperatorSupport(field, operator)

	if (!isUnknownArray(untrustedValues)) {
		throw new TypeError('query membership values must be an array')
	}

	const normalizedValues = untrustedValues.map((value, index) =>
		snapshotQueryValue(
			field,
			value,
			`query membership values[${String(index)}]`,
		),
	)

	return immutableRecord({
		kind: operator,
		field: normalizedFieldName,
		values: immutableArray(normalizedValues),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Normalizes declarative regex data without creating executable RegExp state. */
export const createQueryRegexFilter = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	fieldName: TFieldName,
	pattern: QueryRegexPattern,
): QueryPrimitiveFilterNode<TSchema, TFieldName> => {
	const [normalizedFieldName, field] = resolveQueryField(schema, fieldName)
	const untrustedPattern: unknown = pattern

	assertOperatorSupport(field, 'regex')

	if (!isPlainRecord(untrustedPattern)) {
		throw new TypeError('query regex pattern must be an object')
	}

	if (typeof untrustedPattern.source !== 'string') {
		throw new TypeError('query regex source must be a string')
	}

	if (!isUnknownArray(untrustedPattern.flags)) {
		throw new TypeError('query regex flags must be an array')
	}

	const normalizedFlags: QueryRegexFlag[] = []

	for (const flag of untrustedPattern.flags) {
		if (!isQueryRegexFlag(flag)) {
			throw new TypeError('query regex flag must be a declared flag')
		}

		if (!normalizedFlags.some((candidate) => candidate === flag)) {
			normalizedFlags.push(flag)
		}
	}

	return immutableRecord({
		kind: 'regex',
		field: normalizedFieldName,
		pattern: immutableRecord({
			source: untrustedPattern.source,
			flags: immutableArray(normalizedFlags),
		}),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Creates one null filter for every declared built-in or plugin field. */
export const createQueryNullFilter = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
>(
	schema: TSchema,
	fieldName: TFieldName,
	isNull: boolean,
): QueryPrimitiveFilterNode<TSchema, TFieldName> => {
	const [normalizedFieldName, field] = resolveQueryField(schema, fieldName)

	assertOperatorSupport(field, 'null')

	if (typeof isNull !== 'boolean') {
		throw new TypeError('query null value must be a boolean')
	}

	return immutableRecord({
		kind: 'null',
		field: normalizedFieldName,
		isNull,
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}
