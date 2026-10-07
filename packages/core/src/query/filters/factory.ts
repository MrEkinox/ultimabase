import {
	getPluginFieldStructuralContains,
	type SchemaDefinition,
} from '../../schema/index.js'
import { snapshotJsonValue } from '../../schema/fields/base/portable-json.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import {
	type QueryComparisonFilterOperator,
	type QueryEqualityFilterOperator,
	type QueryFilterTarget,
	type QueryJsonPathExpression,
	type QueryJsonPathFilterOperator,
	type QueryKeyFilterOperator,
	type QueryListFilterOperator,
	type QueryMembershipFilterOperator,
	type QueryPrimitiveFilterNode,
	type QueryRangeFilterOperator,
	type QueryRegexFlag,
	type QueryRegexPattern,
	type QueryStringFilterOperator,
	type QueryStructuralContainmentFilterOperator,
} from './primitive.js'
import { resolveQueryTarget } from './target.js'

export { fieldPath } from './target.js'

import {
	assertOperatorSupport,
	hasListShape,
	isNullableValueOperator,
	isQueryRegexFlag,
	queryTargetProperties,
	snapshotQueryList,
	snapshotQueryListElement,
	snapshotQueryNonNullValue,
	snapshotQueryValue,
	snapshotStructuralValue,
} from './factory-support.js'

/** Creates one immutable scalar value filter after checking runtime capabilities. */
export const createQueryValueFilter = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	operator:
		| QueryComparisonFilterOperator
		| QueryEqualityFilterOperator
		| QueryStringFilterOperator,
	target: unknown,
	value: unknown,
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field === undefined) {
		if (
			operator !== 'equal' &&
			operator !== 'not-equal' &&
			operator !== 'contains'
		) {
			throw new TypeError(
				`query operator ${operator} does not support unstructured JSON paths`,
			)
		}
	} else {
		assertOperatorSupport(field, operator)
	}

	const structural =
		operator === 'contains' &&
		(field === undefined ||
			field.kind === 'json' ||
			field.kind === 'object' ||
			getPluginFieldStructuralContains(field) !== undefined)
	const snapshot = structural
		? snapshotStructuralValue(field, value, 'query filter value')
		: field === undefined
			? snapshotJsonValue(value, 'query filter value')
			: isNullableValueOperator(operator)
				? snapshotQueryValue(field, value, 'query filter value')
				: snapshotQueryNonNullValue(field, value, 'query filter value')

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		value: snapshot,
	})
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
	const resolved = resolveQueryTarget(schema, fieldName)
	const field = resolved.terminalField

	if (field === undefined) {
		throw new TypeError('query ranges require a declared field')
	}

	assertOperatorSupport(field, operator)

	return immutableRecord({
		kind: operator,
		field: resolved.fieldName,
		lower: snapshotQueryNonNullValue(field, lower, 'query range lower bound'),
		upper: snapshotQueryNonNullValue(field, upper, 'query range upper bound'),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Copies membership operands so later caller mutations cannot change a query. */
export const createQueryMembershipFilter = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	operator: QueryMembershipFilterOperator,
	target: unknown,
	values: readonly unknown[],
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField
	const untrustedValues: unknown = values

	if (field === undefined) {
		// Dynamic JSON paths retain JSON values without inventing scalar metadata.
	} else {
		assertOperatorSupport(field, operator)
	}

	if (!isUnknownArray(untrustedValues)) {
		throw new TypeError('query membership values must be an array')
	}

	const normalizedValues = untrustedValues.map((value, index) =>
		field === undefined
			? snapshotJsonValue(value, `query membership values[${String(index)}]`)
			: snapshotQueryValue(
					field,
					value,
					`query membership values[${String(index)}]`,
				),
	)

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		values: immutableArray(normalizedValues),
	})
}

/** Creates one immutable filter over a one-dimensional logical field list. */
export const createQueryListFilter = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	operator: QueryListFilterOperator,
	target: unknown,
	operand?: unknown,
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field === undefined || !hasListShape(field)) {
		throw new TypeError(`query operator ${operator} requires a list field`)
	}

	if (operator === 'list-empty') {
		return immutableRecord({
			kind: operator,
			...queryTargetProperties(resolved),
		})
	}

	if (operator === 'list-has') {
		return immutableRecord({
			kind: operator,
			...queryTargetProperties(resolved),
			value: snapshotQueryListElement(field, operand, 'query list value'),
		})
	}

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		values: snapshotQueryList(field, operand, 'query list values'),
	})
}

/** Creates one structural containment leaf for JSON and typed object values. */
export const createQueryStructuralFilter = <
	const TSchema extends SchemaDefinition,
	TOperator extends QueryStructuralContainmentFilterOperator,
>(
	schema: TSchema,
	operator: TOperator,
	target: QueryFilterTarget<TSchema, TOperator>,
	value: unknown,
): QueryPrimitiveFilterNode<TSchema> => {
	if (operator === 'contains') {
		return createQueryValueFilter(schema, 'contains', target, value)
	}

	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field !== undefined) {
		assertOperatorSupport(field, operator)
	}

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		value: snapshotStructuralValue(field, value, 'query filter value'),
	})
}

/** Creates one immutable top-level key or key-collection predicate. */
export const createQueryKeyFilter = <
	const TSchema extends SchemaDefinition,
	TOperator extends QueryKeyFilterOperator,
>(
	schema: TSchema,
	operator: TOperator,
	target: QueryFilterTarget<TSchema, TOperator>,
	keys: string | readonly string[],
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field !== undefined) {
		assertOperatorSupport(field, operator)
	}

	if (operator === 'has-key') {
		if (typeof keys !== 'string') {
			throw new TypeError('query key must be a string')
		}

		return immutableRecord({
			kind: operator,
			...queryTargetProperties(resolved),
			value: keys,
		})
	}

	const untrustedKeys: unknown = keys

	if (
		!isUnknownArray(untrustedKeys) ||
		!untrustedKeys.every((key) => typeof key === 'string')
	) {
		throw new TypeError('query keys must be an array of strings')
	}

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		keys: immutableArray(untrustedKeys),
	})
}

/** Creates one immutable advanced JSONPath leaf without interpreting its source. */
export const createQueryJsonPathFilter = <
	const TSchema extends SchemaDefinition,
	TOperator extends QueryJsonPathFilterOperator,
>(
	schema: TSchema,
	operator: TOperator,
	target: QueryFilterTarget<TSchema, TOperator>,
	expression: QueryJsonPathExpression,
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field !== undefined) {
		assertOperatorSupport(field, operator)
	}

	const untrustedExpression: unknown = expression

	if (!isPlainRecord(untrustedExpression)) {
		throw new TypeError('query JSONPath expression must be an object')
	}

	for (const key of Object.keys(untrustedExpression)) {
		if (key !== 'source' && key !== 'variables') {
			throw new TypeError(
				`query JSONPath expression contains unknown key: ${key}`,
			)
		}
	}

	if (
		typeof untrustedExpression.source !== 'string' ||
		untrustedExpression.source.length === 0
	) {
		throw new TypeError('query JSONPath source must be a non-empty string')
	}

	const variables: unknown = untrustedExpression.variables

	if (variables !== undefined && !isPlainRecord(variables)) {
		throw new TypeError('query JSONPath variables must be an object')
	}

	const normalizedVariables =
		variables === undefined
			? undefined
			: snapshotJsonValue(variables, 'query JSONPath variables')

	if (
		normalizedVariables !== undefined &&
		!isPlainRecord(normalizedVariables)
	) {
		throw new TypeError('query JSONPath variables must be an object')
	}

	return immutableRecord({
		kind: operator,
		...queryTargetProperties(resolved),
		source: untrustedExpression.source,
		...(normalizedVariables === undefined
			? {}
			: { variables: normalizedVariables }),
	})
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
	const resolved = resolveQueryTarget(schema, fieldName)
	const field = resolved.terminalField

	if (field === undefined) {
		throw new TypeError('query regex requires a declared field')
	}
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
		field: resolved.fieldName,
		pattern: immutableRecord({
			source: untrustedPattern.source,
			flags: immutableArray(normalizedFlags),
		}),
	}) as QueryPrimitiveFilterNode<TSchema, TFieldName>
}

/** Creates one null filter for every declared built-in or plugin field. */
export const createQueryNullFilter = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: unknown,
	isNull: boolean,
): QueryPrimitiveFilterNode<TSchema> => {
	const resolved = resolveQueryTarget(schema, target)
	const field = resolved.terminalField

	if (field !== undefined) {
		assertOperatorSupport(field, 'null')
	}

	if (typeof isNull !== 'boolean') {
		throw new TypeError('query null value must be a boolean')
	}

	return immutableRecord({
		kind: 'null',
		...queryTargetProperties(resolved),
		isNull,
	})
}
