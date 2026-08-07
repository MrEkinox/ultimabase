import {
	Schema,
	type SchemaDefinition,
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

import type {
	QueryExpressionNode,
	QueryFieldName,
	QuerySchemaNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import {
	createQueryJsonPathFilter,
	createQueryNullFilter,
	createQueryKeyFilter,
	createQueryMembershipFilter,
	createQueryRangeFilter,
	createQueryRegexFilter,
	createQueryStructuralFilter,
	createQueryValueFilter,
} from './factory.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import type {
	QueryComparisonFilterOperator,
	QueryEqualityFilterOperator,
	QueryFilterFieldName,
	QueryBuiltInFilterOperator,
	QueryFilterOperand,
	QueryFilterTarget,
	QueryFilterValue,
	QueryJsonPathExpression,
	QueryMembershipFilterOperator,
	QueryRangeFilterOperator,
	QueryRegexPattern,
} from './primitive.js'
import type { OperationObjectId } from '../operations/contracts.js'

/** Bounds portable relation recursion before an adapter sees the QueryBuilder AST. */
export const queryRelationPredicateMaxDepth = 8 as const

/** Selects the collection quantifier applied to one exact relation field. */
export type QueryRelationPredicateOperator = 'every' | 'none' | 'some'

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
	TSource extends SchemaDefinition = SchemaDefinition,
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaDefinition,
> extends QueryExpressionNode {
	readonly kind: 'relation-predicate'
	readonly operator: QueryRelationPredicateOperator
	readonly field: TFieldName
	readonly source: QuerySchemaNode<TSource>
	readonly target: QuerySchemaNode<TTarget>
	readonly expression: QueryFilterNode<TTarget>
}

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
	TSource extends SchemaDefinition = SchemaDefinition,
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaDefinition,
> extends QueryRelationCountBase<TSource, TFieldName, TTarget> {
	readonly comparisons: readonly QueryRelationCountComparison[]
	readonly expression: QueryFilterNode<TTarget>
}

/** Lists every portable relation leaf accepted by the query AST. */
export type QueryRelationFilterNode =
	QueryRelationCountNode | QueryRelationPredicateNode

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
	| QueryRelationPredicateForSchema<TSource>

interface RelationPredicateState<TSchema extends SchemaDefinition> {
	readonly depth: number
	readonly expression: QueryFilterNode<TSchema> | undefined
	readonly schema: TSchema
}

const predicateStates = new WeakMap<object, unknown>()

const readPredicateState = <TSchema extends SchemaDefinition>(
	predicate: RelationPredicate<TSchema>,
): RelationPredicateState<TSchema> => {
	const state = predicateStates.get(predicate)

	if (state === undefined) {
		throw new TypeError('Relation predicate has no internal state')
	}

	// Only this module creates builders and stores the matching schema state.
	return state as unknown as RelationPredicateState<TSchema>
}

const combineExpressions = <TSchema extends SchemaDefinition>(
	current: QueryFilterNode<TSchema> | undefined,
	next: QueryFilterNode<TSchema>,
	kind: 'and' | 'or' = 'and',
): QueryFilterNode<TSchema> => {
	if (current === undefined) {
		return next
	}

	return kind === 'and'
		? normalizeLogicalFilter({ kind: 'and', expressions: [current, next] })
		: normalizeLogicalFilter({ kind: 'or', expressions: [current, next] })
}

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

type QueryComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type QueryTargetOperand<
	TSchema extends SchemaDefinition,
	TOperator extends QueryBuiltInFilterOperator,
	TTarget extends QueryFilterTarget<TSchema, TOperator>,
> = QueryFilterOperand<TSchema, TOperator, TTarget>

/**
 * Builds only the target filter accepted by a relation quantifier.
 *
 * This immutable surface deliberately has no selection, ordering, pagination,
 * terminal, execution-context, or authority method.
 */
export class RelationPredicate<TSchema extends SchemaDefinition> {
	constructor(schema: TSchema) {
		predicateStates.set(
			this,
			immutableRecord({ depth: 0, expression: undefined, schema }),
		)
		Object.freeze(this)
	}

	/** Adds an equality condition for the framework-owned object identifier. */
	byId(id: OperationObjectId<TSchema>): RelationPredicate<TSchema> {
		// The identifier exists on every schema even after concrete fields are erased.
		const idField = 'id' as QueryFilterFieldName<TSchema, 'equal'>

		return this.#append(
			createQueryValueFilter(this.schema, 'equal', idField, id),
		)
	}

	/** Adds an equality condition to the target predicate. */
	equalTo<TTarget extends QueryFilterTarget<TSchema, 'equal'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'equal', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'equal', target, value),
		)
	}

	/** Adds an inequality condition to the target predicate. */
	notEqualTo<TTarget extends QueryFilterTarget<TSchema, 'not-equal'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'not-equal', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'not-equal', target, value),
		)
	}

	/** Adds a strict lower bound to the target predicate. */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'greater-than', fieldName, value),
		)
	}

	/** Adds an inclusive lower bound to the target predicate. */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(
				this.schema,
				'greater-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Adds a strict upper bound to the target predicate. */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'less-than', fieldName, value),
		)
	}

	/** Adds an inclusive upper bound to the target predicate. */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(
				this.schema,
				'less-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Requires the target value to remain inside one inclusive interval. */
	between<TFieldName extends QueryFilterFieldName<TSchema, 'between'>>(
		fieldName: TFieldName,
		lower: QueryComparisonValue<TSchema, TFieldName>,
		upper: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryRangeFilter(this.schema, 'between', fieldName, lower, upper),
		)
	}

	/** Requires the target value to remain outside one inclusive interval. */
	notBetween<TFieldName extends QueryFilterFieldName<TSchema, 'not-between'>>(
		fieldName: TFieldName,
		lower: QueryComparisonValue<TSchema, TFieldName>,
		upper: QueryComparisonValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryRangeFilter(
				this.schema,
				'not-between',
				fieldName,
				lower,
				upper,
			),
		)
	}

	/** Requires the target value to occur in one immutable candidate list. */
	containedIn<TTarget extends QueryFilterTarget<TSchema, 'in'>>(
		target: TTarget,
		values: readonly QueryTargetOperand<TSchema, 'in', TTarget>[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryMembershipFilter(this.schema, 'in', target, values),
		)
	}

	/** Excludes target values occurring in one immutable candidate list. */
	notContainedIn<TTarget extends QueryFilterTarget<TSchema, 'not-in'>>(
		target: TTarget,
		values: readonly QueryTargetOperand<TSchema, 'not-in', TTarget>[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryMembershipFilter(this.schema, 'not-in', target, values),
		)
	}

	/** Adds string substring matching or structured containment to the target. */
	contains<TTarget extends QueryFilterTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'contains', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryStructuralFilter(this.schema, 'contains', target, value),
		)
	}

	/** Requires one structured target to be contained by the supplied value. */
	containedBy<TTarget extends QueryFilterTarget<TSchema, 'contained-by'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'contained-by', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryStructuralFilter(this.schema, 'contained-by', target, value),
		)
	}

	/** Requires one top-level key on a structured target. */
	hasKey<TTarget extends QueryFilterTarget<TSchema, 'has-key'>>(
		target: TTarget,
		key: QueryTargetOperand<TSchema, 'has-key', TTarget> & string,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryKeyFilter(this.schema, 'has-key', target, key),
		)
	}

	/** Requires at least one candidate key on a structured target. */
	hasAnyKeys<TTarget extends QueryFilterTarget<TSchema, 'has-any-keys'>>(
		target: TTarget,
		keys: readonly (QueryTargetOperand<TSchema, 'has-any-keys', TTarget> &
			string)[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryKeyFilter(this.schema, 'has-any-keys', target, keys),
		)
	}

	/** Requires every candidate key on a structured target. */
	hasAllKeys<TTarget extends QueryFilterTarget<TSchema, 'has-all-keys'>>(
		target: TTarget,
		keys: readonly (QueryTargetOperand<TSchema, 'has-all-keys', TTarget> &
			string)[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryKeyFilter(this.schema, 'has-all-keys', target, keys),
		)
	}

	/** Adds one advanced JSONPath existence predicate to the relation filter. */
	jsonPathExists(
		target: QueryFilterTarget<TSchema, 'json-path-exists'>,
		expression: QueryJsonPathExpression,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryJsonPathFilter(
				this.schema,
				'json-path-exists',
				target,
				expression,
			),
		)
	}

	/** Adds one advanced JSONPath boolean predicate to the relation filter. */
	jsonPathMatches(
		target: QueryFilterTarget<TSchema, 'json-path-matches'>,
		expression: QueryJsonPathExpression,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryJsonPathFilter(
				this.schema,
				'json-path-matches',
				target,
				expression,
			),
		)
	}

	/** Adds a portable prefix condition to a target string field. */
	startsWith<TTarget extends QueryFilterTarget<TSchema, 'starts-with'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'starts-with', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'starts-with', target, value),
		)
	}

	/** Adds a portable suffix condition to a target string field. */
	endsWith<TTarget extends QueryFilterTarget<TSchema, 'ends-with'>>(
		target: TTarget,
		value: QueryTargetOperand<TSchema, 'ends-with', TTarget>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'ends-with', target, value),
		)
	}

	/** Adds a declarative regular-expression condition to a target string field. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): RelationPredicate<TSchema> {
		return this.#append(createQueryRegexFilter(this.schema, fieldName, pattern))
	}

	/** Requires one target field to contain a non-null value. */
	isNotNull(
		target: QueryFilterTarget<TSchema, 'null'>,
	): RelationPredicate<TSchema> {
		return this.#append(createQueryNullFilter(this.schema, target, false))
	}

	/** Requires one target field to contain null. */
	isNull(
		target: QueryFilterTarget<TSchema, 'null'>,
	): RelationPredicate<TSchema> {
		return this.#append(createQueryNullFilter(this.schema, target, true))
	}

	/** Combines another target predicate through AND. */
	and(predicate: RelationPredicate<TSchema>): RelationPredicate<TSchema> {
		return this.#combine(predicate, 'and', false)
	}

	/** Combines another target predicate through OR. */
	or(predicate: RelationPredicate<TSchema>): RelationPredicate<TSchema> {
		return this.#combine(predicate, 'or', false)
	}

	/** Negates another target predicate before combining it through AND. */
	not(predicate: RelationPredicate<TSchema>): RelationPredicate<TSchema> {
		return this.#combine(predicate, 'and', true)
	}

	/** Requires at least one related target to satisfy the nested predicate. */
	some<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): RelationPredicate<TSchema> {
		return this.#relation('some', fieldName, predicate)
	}

	/** Requires no related target to satisfy the nested predicate. */
	none<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): RelationPredicate<TSchema> {
		return this.#relation('none', fieldName, predicate)
	}

	/** Requires every related target to satisfy the nested predicate. */
	every<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): RelationPredicate<TSchema> {
		return this.#relation('every', fieldName, predicate)
	}

	get schema(): TSchema {
		return readPredicateState(this).schema
	}

	/** Supplies only trusted QueryBuilder assembly with the normalized expression. */
	toExpression(): QueryFilterNode<TSchema> {
		return (
			readPredicateState(this).expression ??
			immutableRecord({ kind: 'constant', value: true })
		)
	}

	#append(
		filter: QueryFilterNode<TSchema>,
		kind: 'and' | 'or' = 'and',
	): RelationPredicate<TSchema> {
		const state = readPredicateState(this)

		return createRelationPredicate(
			state.schema,
			state.depth,
			combineExpressions(state.expression, filter, kind),
		)
	}

	#combine(
		predicate: RelationPredicate<TSchema>,
		kind: 'and' | 'or',
		negate: boolean,
	): RelationPredicate<TSchema> {
		const state = readPredicateState(this)
		const other = readPredicateState(predicate)

		if (state.schema !== other.schema) {
			throw new TypeError(
				'logical predicates must use the same schema definition',
			)
		}

		const expression = predicate.toExpression()

		return this.#append(
			negate ? normalizeLogicalFilter({ kind: 'not', expression }) : expression,
			kind,
		)
	}

	#relation<TFieldName extends SchemaRelationFieldName<TSchema>>(
		operator: QueryRelationPredicateOperator,
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): RelationPredicate<TSchema> {
		const state = readPredicateState(this)

		if (state.depth >= queryRelationPredicateMaxDepth) {
			throw createQueryRelationDepthError()
		}

		const field = state.schema.fields[fieldName]
		const target =
			field === undefined ? undefined : getFieldSchemaTarget(field)?.()

		if (field?.kind !== 'relation' || !Schema.is(target)) {
			throw new TypeError('relation predicate field must reference a relation')
		}

		const exactTarget = target as unknown as SchemaRelationTarget<
			TSchema,
			TFieldName
		>
		const nested = predicate(
			createEmptyRelationPredicate(exactTarget, state.depth + 1),
		)

		if (
			!(nested instanceof RelationPredicate) ||
			(nested.schema as SchemaDefinition) !== target
		) {
			throw new TypeError(
				'relation predicate callback must return the target predicate builder',
			)
		}

		const node: QueryRelationPredicateNode<
			TSchema,
			TFieldName,
			SchemaRelationTarget<TSchema, TFieldName>
		> = immutableRecord({
			kind: 'relation-predicate',
			operator,
			field: fieldName,
			source: createQueryAst(state.schema).schema,
			target: createQueryAst(exactTarget).schema,
			expression: nested.toExpression(),
		})

		return this.#append(node)
	}
}

const createRelationPredicate = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	depth: number,
	expression: QueryFilterNode<TSchema>,
): RelationPredicate<TSchema> => {
	const predicate = new RelationPredicate(schema)

	predicateStates.set(predicate, immutableRecord({ depth, expression, schema }))
	Object.freeze(predicate)

	return predicate
}

const createEmptyRelationPredicate = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	depth: number,
): RelationPredicate<TSchema> => {
	const predicate = new RelationPredicate(schema)

	predicateStates.set(
		predicate,
		immutableRecord({ depth, expression: undefined, schema }),
	)
	Object.freeze(predicate)

	return predicate
}

/** Builds one exact immutable relation node for the public QueryBuilder class. */
export const createQueryRelationPredicate = <
	TSource extends SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSource>,
>(
	source: TSource,
	operator: QueryRelationPredicateOperator,
	fieldName: TFieldName,
	predicate: (
		filter: RelationPredicate<SchemaRelationTarget<TSource, TFieldName>>,
	) => RelationPredicate<SchemaRelationTarget<TSource, TFieldName>>,
): QueryRelationPredicateNode<
	TSource,
	TFieldName,
	SchemaRelationTarget<TSource, TFieldName>
> => {
	const field = source.fields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	if (field?.kind !== 'relation' || !Schema.is(target)) {
		throw new TypeError('relation predicate field must reference a relation')
	}
	const exactTarget = target as unknown as SchemaRelationTarget<
		TSource,
		TFieldName
	>
	const nested = predicate(createEmptyRelationPredicate(exactTarget, 1))

	if (
		!(nested instanceof RelationPredicate) ||
		(nested.schema as SchemaDefinition) !== target
	) {
		throw new TypeError(
			'relation predicate callback must return the target predicate builder',
		)
	}

	return immutableRecord({
		kind: 'relation-predicate',
		operator,
		field: fieldName,
		source: createQueryAst(source).schema,
		target: createQueryAst(exactTarget).schema,
		expression: nested.toExpression(),
	})
}

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
): value is QueryRelationPredicateNode =>
	isPlainRecord(value) &&
	value.kind === 'relation-predicate' &&
	(value.operator === 'some' ||
		value.operator === 'none' ||
		value.operator === 'every') &&
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
