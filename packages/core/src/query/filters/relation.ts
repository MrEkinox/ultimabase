import {
	Schema,
	type SchemaDefinition,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { FrameworkError } from '../../errors/framework-error.js'
import {
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
	createQueryNullFilter,
	createQueryMembershipFilter,
	createQueryRangeFilter,
	createQueryRegexFilter,
	createQueryValueFilter,
} from './factory.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
	QueryRegexPattern,
} from './primitive.js'
import type { OperationObjectId } from '../operations/contracts.js'

/** Bounds portable relation recursion before an adapter sees the Query AST. */
export const queryRelationPredicateMaxDepth = 8 as const

/** Selects the collection quantifier applied to one exact relation field. */
export type QueryRelationPredicateOperator = 'every' | 'none' | 'some'

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

const createDepthError = (): FrameworkError<'VALIDATION_ERROR'> =>
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

type QueryStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

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
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'equal', fieldName, value),
		)
	}

	/** Adds an inequality condition to the target predicate. */
	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'not-equal', fieldName, value),
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
	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryMembershipFilter(this.schema, 'in', fieldName, values),
		)
	}

	/** Excludes target values occurring in one immutable candidate list. */
	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryMembershipFilter(this.schema, 'not-in', fieldName, values),
		)
	}

	/** Adds a portable substring condition to a target string field. */
	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'contains', fieldName, value),
		)
	}

	/** Adds a portable prefix condition to a target string field. */
	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'starts-with', fieldName, value),
		)
	}

	/** Adds a portable suffix condition to a target string field. */
	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): RelationPredicate<TSchema> {
		return this.#append(
			createQueryValueFilter(this.schema, 'ends-with', fieldName, value),
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
		fieldName: QueryFilterFieldName<TSchema, 'null'>,
	): RelationPredicate<TSchema> {
		return this.#append(createQueryNullFilter(this.schema, fieldName, false))
	}

	/** Requires one target field to contain null. */
	isNull(
		fieldName: QueryFilterFieldName<TSchema, 'null'>,
	): RelationPredicate<TSchema> {
		return this.#append(createQueryNullFilter(this.schema, fieldName, true))
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

	/** Supplies only trusted Query assembly with the normalized expression. */
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
			throw createDepthError()
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

/** Builds one exact immutable relation node for the public Query class. */
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
	collected: QueryRelationPredicateNode[],
): void => {
	if (depth > queryRelationPredicateMaxDepth) {
		throw createDepthError()
	}

	if (ancestors.has(expression)) {
		throw new TypeError(
			'relation predicate must not contain circular references',
		)
	}

	ancestors.add(expression)

	try {
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
): readonly QueryRelationPredicateNode[] => {
	const collected: QueryRelationPredicateNode[] = []

	collectRelationPredicateNodes(expression, 1, new WeakSet<object>(), collected)

	return Object.freeze(collected)
}
