import {
	Schema,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaPointerFieldName,
	type SchemaPointerTarget,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { FrameworkError } from '../../errors/framework-error.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryExpressionNode, QuerySchemaNode } from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import type { QueryFilterNode } from './logical.js'
import type {
	QueryComparisonFilterOperator,
	QueryEqualityFilterOperator,
	QueryMembershipFilterOperator,
	QueryRangeFilterOperator,
} from './primitive.js'

/** Bounds portable relation recursion before an adapter sees the QueryBuilder AST. */
export const queryRelationPredicateMaxDepth = 8 as const

/** Selects the collection quantifier applied to one exact to-many relation. */
export type QueryRelationQuantifierOperator = 'every' | 'none' | 'some'

/** Selects the target predicate applied through one exact pointer. */
export type QueryPointerPredicateOperator = 'is' | 'is-not'

/** Lists every target-traversal operator retained by the portable relation AST. */
export type QueryRelationPredicateOperator =
	QueryPointerPredicateOperator | QueryRelationQuantifierOperator

/** Lists portable comparisons supported by the non-null relation cardinality. */
export type QueryRelationCountOperator =
	| QueryComparisonFilterOperator
	| QueryEqualityFilterOperator
	| QueryMembershipFilterOperator
	| QueryRangeFilterOperator

/** Describes portable comparisons against a relation's visible cardinality. */
export interface QueryRelationCountInput {
	readonly between?: Readonly<{ lower: number; upper: number }>
	readonly eq?: number
	readonly gt?: number
	readonly gte?: number
	readonly in?: readonly number[]
	readonly lt?: number
	readonly lte?: number
	readonly ne?: number
	readonly notBetween?: Readonly<{ lower: number; upper: number }>
	readonly notIn?: readonly number[]
}

/** Filters one source object by rows reachable through one declared relation. */
export interface QueryRelationPredicateNode<
	TSource extends SchemaDefinition = SchemaClass,
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaClass,
> extends QueryExpressionNode {
	readonly kind: 'relation-predicate'
	readonly operator: QueryRelationPredicateOperator
	readonly field: TFieldName
	readonly source: QuerySchemaNode<TSource>
	readonly target: QuerySchemaNode<TTarget>
	readonly expression: QueryFilterNode<TTarget>
}

/** Traverses one pointer while avoiding recursive public AST expansion for circular schemas. */
export interface QueryPointerPredicateNode<
	TSource extends SchemaDefinition = SchemaClass,
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaClass,
> extends QueryExpressionNode {
	readonly kind: 'relation-predicate'
	readonly operator: QueryPointerPredicateOperator
	readonly field: TFieldName
	readonly source: QuerySchemaNode<TSource>
	readonly target: QuerySchemaNode<TTarget>
	readonly expression: QueryFilterNode<SchemaClass>
}

/** Lists both collection and pointer target predicates sharing one AST discriminant. */
export type QueryRelationshipPredicateNode =
	QueryPointerPredicateNode | QueryRelationPredicateNode

interface QueryRelationCountBase<
	TSource extends SchemaDefinition,
	TFieldName extends string,
	TTarget extends SchemaDefinition,
> extends QueryExpressionNode {
	readonly field: TFieldName
	readonly kind: 'relation-count'
	readonly source: QuerySchemaNode<TSource>
	readonly target: QuerySchemaNode<TTarget>
}

/** Represents one comparison against a relation's computed cardinality. */
export type QueryRelationCountComparison =
	| Readonly<{
			operator: QueryComparisonFilterOperator | QueryEqualityFilterOperator
			value: number
	  }>
	| Readonly<{
			operator: QueryMembershipFilterOperator
			values: readonly number[]
	  }>
	| Readonly<{
			lower: number
			operator: QueryRangeFilterOperator
			upper: number
	  }>

/** Compares one filtered visible relation cardinality without duplicating its aggregate. */
export interface QueryRelationCountNode<
	TSource extends SchemaDefinition = SchemaClass,
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaClass,
> extends QueryRelationCountBase<TSource, TFieldName, TTarget> {
	readonly comparisons: readonly QueryRelationCountComparison[]
	readonly expression: QueryFilterNode<TTarget>
}

/** Lists every portable relation leaf accepted by the query AST. */
export type QueryRelationFilterNode =
	| QueryPointerPredicateNode
	| QueryRelationCountNode
	| QueryRelationPredicateNode

/** Correlates every relation field with its exact declared target schema. */
export type QueryRelationPredicateForSchema<TSource extends SchemaDefinition> =
	{
		readonly [
			TFieldName in SchemaRelationFieldName<TSource>
		]: QueryRelationPredicateNode<
			TSource,
			TFieldName,
			SchemaRelationTarget<TSource, TFieldName>
		>
	}[SchemaRelationFieldName<TSource>]

/** Correlates pointer predicates with their exact declared target schemas. */
export type QueryPointerPredicateForSchema<TSource extends SchemaDefinition> = {
	readonly [
		TFieldName in SchemaPointerFieldName<TSource>
	]: QueryPointerPredicateNode<
		TSource,
		TFieldName,
		SchemaPointerTarget<TSource, TFieldName>
	>
}[SchemaPointerFieldName<TSource>]

/** Correlates relation cardinality leaves with their exact target schemas. */
export type QueryRelationCountForSchema<TSource extends SchemaDefinition> = {
	readonly [
		TFieldName in SchemaRelationFieldName<TSource>
	]: QueryRelationCountNode<
		TSource,
		TFieldName,
		SchemaRelationTarget<TSource, TFieldName>
	>
}[SchemaRelationFieldName<TSource>]

/** Lists every schema-correlated relation leaf accepted by one source schema. */
export type QueryRelationFilterForSchema<TSource extends SchemaDefinition> =
	| QueryRelationCountForSchema<TSource>
	| QueryPointerPredicateForSchema<TSource>
	| QueryRelationPredicateForSchema<TSource>

/** Creates the shared typed failure for every relation-filter authoring form. */
export const createQueryRelationDepthError =
	(): FrameworkError<'VALIDATION_ERROR'> =>
		new FrameworkError(
			'VALIDATION_ERROR',
			`Relation predicates cannot exceed ${String(queryRelationPredicateMaxDepth)} levels.`,
			{
				publicMessage: 'The relation filter is nested too deeply.',
				internalDetails: { kind: 'query-relation-depth-exceeded' },
			},
		)

const assertRelationCountValue = (value: unknown, path: string): number => {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new TypeError(`${path} must be a non-negative safe integer`)
	}

	return value as number
}

const relationCountOperator = (
	operator: keyof QueryRelationCountInput,
): QueryRelationCountOperator => {
	switch (operator) {
		case 'eq':
			return 'equal'
		case 'ne':
			return 'not-equal'
		case 'gt':
			return 'greater-than'
		case 'gte':
			return 'greater-than-or-equal'
		case 'lt':
			return 'less-than'
		case 'lte':
			return 'less-than-or-equal'
		case 'in':
			return 'in'
		case 'notIn':
			return 'not-in'
		case 'between':
			return 'between'
		case 'notBetween':
			return 'not-between'
	}
}

const createRelationCountComparison = (
	operator: keyof QueryRelationCountInput,
	operand: unknown,
): QueryRelationCountComparison => {
	const normalizedOperator = relationCountOperator(operator)

	if (normalizedOperator === 'in' || normalizedOperator === 'not-in') {
		if (!isUnknownArray(operand)) {
			throw new TypeError(
				`relation count ${normalizedOperator} must be an array`,
			)
		}

		return immutableRecord({
			operator: normalizedOperator,
			values: immutableArray(
				operand.map((value, index) =>
					assertRelationCountValue(
						value,
						`relation count ${normalizedOperator}[${String(index)}]`,
					),
				),
			),
		})
	}

	if (
		normalizedOperator === 'between' ||
		normalizedOperator === 'not-between'
	) {
		if (
			!isPlainRecord(operand) ||
			Object.keys(operand).length !== 2 ||
			!Object.hasOwn(operand, 'lower') ||
			!Object.hasOwn(operand, 'upper')
		) {
			throw new TypeError(
				`relation count ${normalizedOperator} must contain only lower and upper`,
			)
		}

		return immutableRecord({
			lower: assertRelationCountValue(
				operand.lower,
				`relation count ${normalizedOperator}.lower`,
			),
			operator: normalizedOperator,
			upper: assertRelationCountValue(
				operand.upper,
				`relation count ${normalizedOperator}.upper`,
			),
		})
	}

	return immutableRecord({
		operator: normalizedOperator,
		value: assertRelationCountValue(
			operand,
			`relation count ${normalizedOperator}`,
		),
	})
}

/** Creates one exact immutable visible-cardinality leaf for a relation field. */
export const createQueryRelationCount = <
	TSource extends SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSource>,
>(
	source: TSource,
	fieldName: TFieldName,
	input: QueryRelationCountInput,
	expression: QueryFilterNode<SchemaRelationTarget<TSource, TFieldName>>,
): QueryRelationCountNode<
	TSource,
	TFieldName,
	SchemaRelationTarget<TSource, TFieldName>
> => {
	const field = source.fields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	if (field?.kind !== 'relation' || !Schema.is(target)) {
		throw new TypeError('relation count field must reference a relation')
	}
	const exactTarget = target as unknown as SchemaRelationTarget<
		TSource,
		TFieldName
	>

	const comparisons = Object.entries(input).map(([operator, operand]) => {
		if (
			operator !== 'eq' &&
			operator !== 'ne' &&
			operator !== 'gt' &&
			operator !== 'gte' &&
			operator !== 'lt' &&
			operator !== 'lte' &&
			operator !== 'in' &&
			operator !== 'notIn' &&
			operator !== 'between' &&
			operator !== 'notBetween'
		) {
			throw new TypeError(`relation count operator is unsupported: ${operator}`)
		}

		return createRelationCountComparison(operator, operand)
	})

	if (comparisons.length === 0) {
		throw new TypeError('relation count must contain an operator')
	}

	return immutableRecord({
		comparisons: immutableArray(comparisons),
		expression,
		field: fieldName,
		kind: 'relation-count' as const,
		source: createQueryAst(source).schema,
		target: createQueryAst(exactTarget).schema,
	})
}

const isQueryRelationCountComparison = (
	value: unknown,
): value is QueryRelationCountComparison => {
	if (!isPlainRecord(value)) return false

	switch (value.operator) {
		case 'equal':
		case 'not-equal':
		case 'greater-than':
		case 'greater-than-or-equal':
		case 'less-than':
		case 'less-than-or-equal':
			return Number.isSafeInteger(value.value) && (value.value as number) >= 0
		case 'in':
		case 'not-in':
			return (
				isUnknownArray(value.values) &&
				value.values.every(
					(candidate) =>
						Number.isSafeInteger(candidate) && (candidate as number) >= 0,
				)
			)
		case 'between':
		case 'not-between':
			return (
				Number.isSafeInteger(value.lower) &&
				(value.lower as number) >= 0 &&
				Number.isSafeInteger(value.upper) &&
				(value.upper as number) >= 0
			)
		default:
			return false
	}
}

/** Narrows portable visible-cardinality leaves before Runtime interprets them. */
export const isQueryRelationCountNode = (
	value: unknown,
): value is QueryRelationCountNode => {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'relation-count' ||
		typeof value.field !== 'string' ||
		!isPlainRecord(value.source) ||
		value.source.kind !== 'schema' ||
		!Schema.is(value.source.definition) ||
		!isPlainRecord(value.target) ||
		value.target.kind !== 'schema' ||
		!Schema.is(value.target.definition)
	) {
		return false
	}

	return (
		isUnknownArray(value.comparisons) &&
		value.comparisons.length > 0 &&
		value.comparisons.every(isQueryRelationCountComparison) &&
		isPlainRecord(value.expression) &&
		typeof value.expression.kind === 'string'
	)
}

/** Narrows portable expression leaves before Runtime or adapters interpret them. */
export const isQueryRelationPredicateNode = (
	value: unknown,
): value is QueryRelationshipPredicateNode =>
	isPlainRecord(value) &&
	value.kind === 'relation-predicate' &&
	(value.operator === 'some' ||
		value.operator === 'none' ||
		value.operator === 'every' ||
		value.operator === 'is' ||
		value.operator === 'is-not') &&
	typeof value.field === 'string' &&
	isPlainRecord(value.source) &&
	value.source.kind === 'schema' &&
	Schema.is(value.source.definition) &&
	isPlainRecord(value.target) &&
	value.target.kind === 'schema' &&
	Schema.is(value.target.definition) &&
	isPlainRecord(value.expression) &&
	typeof value.expression.kind === 'string'

const collectRelationPredicateNodes = (
	expression: QueryExpressionNode,
	depth: number,
	ancestors: WeakSet<object>,
	collected: QueryRelationFilterNode[],
): void => {
	if (depth > queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	if (ancestors.has(expression)) {
		throw new TypeError(
			'relation predicate must not contain circular references',
		)
	}

	ancestors.add(expression)

	try {
		if (isQueryRelationCountNode(expression)) {
			collected.push(expression)
			collectRelationPredicateNodes(
				expression.expression,
				depth + 1,
				ancestors,
				collected,
			)
			return
		}

		if (isQueryRelationPredicateNode(expression)) {
			collected.push(expression)
			collectRelationPredicateNodes(
				expression.expression,
				depth + 1,
				ancestors,
				collected,
			)
			return
		}

		const candidate: unknown = expression

		if (!isPlainRecord(candidate)) {
			return
		}

		if (isUnknownArray(candidate.expressions)) {
			for (const child of candidate.expressions) {
				if (isPlainRecord(child) && typeof child.kind === 'string') {
					collectRelationPredicateNodes(
						child as unknown as QueryExpressionNode,
						depth,
						ancestors,
						collected,
					)
				}
			}
		}

		if (
			isPlainRecord(candidate.expression) &&
			typeof candidate.expression.kind === 'string'
		) {
			collectRelationPredicateNodes(
				candidate.expression as unknown as QueryExpressionNode,
				depth,
				ancestors,
				collected,
			)
		}
	} finally {
		ancestors.delete(expression)
	}
}

/** Collects relation leaves in deterministic depth-first declaration order. */
export const collectQueryRelationPredicates = (
	expression: QueryExpressionNode,
): readonly QueryRelationFilterNode[] => {
	const collected: QueryRelationFilterNode[] = []

	collectRelationPredicateNodes(expression, 1, new WeakSet<object>(), collected)

	return Object.freeze(collected)
}
