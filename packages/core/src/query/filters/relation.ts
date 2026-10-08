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
import {
	readWhereOperatorKind,
	type QueryComparisonFilterOperator,
	type QueryEqualityFilterOperator,
	type QueryMembershipFilterOperator,
	type QueryRangeFilterOperator,
} from './primitive.js'
import { traverseQueryExpression } from './traversal.js'

/** Bounds portable relation recursion before an adapter sees the QueryBuilder AST. */
export const queryRelationPredicateMaxDepth = 8 as const

/** Bounds relation-predicate work across one portable Runtime operation. */
export const queryRelationPredicateMaxCount = 64 as const

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

/** Creates the shared failure for an over-wide relation predicate graph. */
export const createQueryRelationComplexityError =
	(): FrameworkError<'VALIDATION_ERROR'> =>
		new FrameworkError(
			'VALIDATION_ERROR',
			`Relation predicates cannot exceed ${String(queryRelationPredicateMaxCount)} occurrences per operation.`,
			{
				publicMessage: 'The relation filter is too complex.',
				internalDetails: { kind: 'query-relation-complexity-exceeded' },
			},
		)

/**
 * Resolves the declared target of one pointer or relation field.
 *
 * Returns `undefined` when the field is absent, has another kind, or its lazy
 * target is not a compiled schema, so each caller keeps its own diagnostic.
 */
export const resolveRelationshipTarget = (
	schema: SchemaDefinition,
	fieldName: unknown,
	kind: 'pointer' | 'relation',
): SchemaDefinition | undefined => {
	const field =
		typeof fieldName === 'string'
			? schema.persistedFields[fieldName]
			: undefined
	const target =
		field?.kind === kind ? getFieldSchemaTarget(field)?.() : undefined

	return Schema.is(target) ? target : undefined
}

/** Lists the `where` keys accepted inside one relation `count` object. */
export const relationCountOperators: ReadonlySet<string> = new Set([
	'eq',
	'ne',
	'gt',
	'gte',
	'lt',
	'lte',
	'in',
	'notIn',
	'between',
	'notBetween',
] satisfies readonly (keyof QueryRelationCountInput)[])

const isRelationCountValue = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const readRelationCountValue = (value: unknown, path: string): number => {
	if (!isRelationCountValue(value)) {
		throw new TypeError(`${path} must be a non-negative safe integer`)
	}

	return value
}

const createRelationCountComparison = (
	operator: string,
	operand: unknown,
): QueryRelationCountComparison => {
	const kind = readWhereOperatorKind(operator)
	const path = `relation count ${String(kind)}`

	switch (kind) {
		case 'in':
		case 'not-in':
			if (!isUnknownArray(operand)) {
				throw new TypeError(`${path} must be an array`)
			}

			return immutableRecord({
				operator: kind,
				values: immutableArray(
					operand.map((value, index) =>
						readRelationCountValue(value, `${path}[${String(index)}]`),
					),
				),
			})
		case 'between':
		case 'not-between':
			if (
				!isPlainRecord(operand) ||
				Object.keys(operand).length !== 2 ||
				!Object.hasOwn(operand, 'lower') ||
				!Object.hasOwn(operand, 'upper')
			) {
				throw new TypeError(`${path} must contain only lower and upper`)
			}

			return immutableRecord({
				lower: readRelationCountValue(operand.lower, `${path}.lower`),
				operator: kind,
				upper: readRelationCountValue(operand.upper, `${path}.upper`),
			})
		case 'equal':
		case 'not-equal':
		case 'greater-than':
		case 'greater-than-or-equal':
		case 'less-than':
		case 'less-than-or-equal':
			return immutableRecord({
				operator: kind,
				value: readRelationCountValue(operand, path),
			})
		default:
			throw new TypeError(`relation count operator is unsupported: ${operator}`)
	}
}

/** Creates one immutable visible-cardinality leaf for a relation field. */
export const createQueryRelationCount = <TSource extends SchemaDefinition>(
	source: TSource,
	fieldName: SchemaRelationFieldName<TSource>,
	input: QueryRelationCountInput,
	expression: QueryFilterNode<SchemaDefinition>,
): QueryRelationCountNode<SchemaDefinition, string, SchemaDefinition> => {
	const target = resolveRelationshipTarget(source, fieldName, 'relation')

	if (target === undefined) {
		throw new TypeError('relation count field must reference a relation')
	}

	const comparisons = Object.entries(input).map(([operator, operand]) =>
		createRelationCountComparison(operator, operand),
	)

	if (comparisons.length === 0) {
		throw new TypeError('relation count must contain an operator')
	}

	return immutableRecord({
		comparisons: immutableArray(comparisons),
		expression,
		field: fieldName,
		kind: 'relation-count',
		source: createQueryAst(source).schema,
		target: createQueryAst(target).schema,
	})
}

const isRelationCountComparison = (value: unknown): boolean => {
	if (!isPlainRecord(value)) return false

	switch (value.operator) {
		case 'in':
		case 'not-in':
			return (
				isUnknownArray(value.values) && value.values.every(isRelationCountValue)
			)
		case 'between':
		case 'not-between':
			return (
				isRelationCountValue(value.lower) && isRelationCountValue(value.upper)
			)
		case 'equal':
		case 'not-equal':
		case 'greater-than':
		case 'greater-than-or-equal':
		case 'less-than':
		case 'less-than-or-equal':
			return isRelationCountValue(value.value)
		default:
			return false
	}
}

const isQuerySchemaNode = (value: unknown): boolean =>
	isPlainRecord(value) && value.kind === 'schema' && Schema.is(value.definition)

/** Checks the source, target, field, and nested expression shared by relation leaves. */
const isRelationLeaf = (
	value: unknown,
	kind: 'relation-count' | 'relation-predicate',
): value is Readonly<Record<string, unknown>> =>
	isPlainRecord(value) &&
	value.kind === kind &&
	typeof value.field === 'string' &&
	isQuerySchemaNode(value.source) &&
	isQuerySchemaNode(value.target) &&
	isPlainRecord(value.expression) &&
	typeof value.expression.kind === 'string'

/** Narrows portable visible-cardinality leaves before Runtime interprets them. */
export const isQueryRelationCountNode = (
	value: unknown,
): value is QueryRelationCountNode =>
	isRelationLeaf(value, 'relation-count') &&
	isUnknownArray(value.comparisons) &&
	value.comparisons.length > 0 &&
	value.comparisons.every(isRelationCountComparison)

const relationPredicateOperators: ReadonlySet<unknown> = new Set([
	'every',
	'is',
	'is-not',
	'none',
	'some',
] satisfies readonly QueryRelationPredicateOperator[])

/** Narrows portable expression leaves before Runtime or adapters interpret them. */
export const isQueryRelationPredicateNode = (
	value: unknown,
): value is QueryRelationshipPredicateNode =>
	isRelationLeaf(value, 'relation-predicate') &&
	relationPredicateOperators.has(value.operator)

/** Collects relation leaves in deterministic depth-first declaration order. */
export const collectQueryRelationPredicates = (
	expression: QueryExpressionNode,
): readonly QueryRelationFilterNode[] => {
	const collected: QueryRelationFilterNode[] = []

	traverseQueryExpression(expression, (candidate, targetDepth) => {
		if (targetDepth > queryRelationPredicateMaxDepth) {
			throw createQueryRelationDepthError()
		}

		if (
			isQueryRelationCountNode(candidate) ||
			isQueryRelationPredicateNode(candidate)
		) {
			if (collected.length >= queryRelationPredicateMaxCount) {
				throw createQueryRelationComplexityError()
			}
			collected.push(candidate)
			return 'target'
		}

		return 'continue'
	})

	return Object.freeze(collected)
}
