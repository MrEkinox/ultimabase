import type { SchemaDefinition } from '../schema/definition.js'
import {
	createQueryJsonPathFilter,
	createQueryMembershipFilter,
	createQueryKeyFilter,
	createQueryNullFilter,
	createQueryRangeFilter,
	createQueryRegexFilter,
	createQueryStructuralFilter,
	createQueryValueFilter,
} from '../../query/filters/factory.js'
import {
	normalizeLogicalFilter,
	type QueryFilterExpression,
	type QueryFilterNode,
} from '../../query/filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterOperand,
	QueryFilterTarget,
	QueryFilterValue,
	QueryJsonPathExpression,
	QueryPrimitiveFilterNode,
	QueryRegexPattern,
} from '../../query/filters/primitive.js'
import type { QueryFieldName } from '../../query/ast/contracts.js'

import type { AccessFilter } from './contracts.js'

interface AccessFilterState<TSchema extends SchemaDefinition> {
	readonly schema: TSchema
	readonly expression?: AccessFilterExpression<TSchema>
}

/** Keeps native Access predicates scalar-only until a dedicated policy API opts in. */
type AccessFilterExpression<TSchema extends SchemaDefinition> =
	QueryFilterExpression<QueryPrimitiveFilterNode<TSchema>>

// Private state prevents application callbacks from inspecting or replacing an
// Access predicate while preserving a small public builder surface.
const accessFilterStates = new WeakMap<object, unknown>()

const readAccessFilterState = <const TSchema extends SchemaDefinition>(
	filter: unknown,
): AccessFilterState<TSchema> => {
	if (
		(typeof filter !== 'object' && typeof filter !== 'function') ||
		filter === null
	) {
		throw new TypeError('Access filter result must be an AccessFilter')
	}

	const state: unknown = accessFilterStates.get(filter)

	if (state === undefined) {
		throw new TypeError('Access filter result must be an AccessFilter')
	}

	// Only this module creates state records and couples them to their schema.
	return state as AccessFilterState<TSchema>
}

type AccessComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

/** Implements the public capability interface without exporting construction. */
class ImmutableAccessFilter<
	const TSchema extends SchemaDefinition,
> implements AccessFilter<TSchema> {
	constructor(state: AccessFilterState<TSchema>) {
		accessFilterStates.set(this, state)
		Object.freeze(this)
	}

	equalTo<TTarget extends QueryFilterTarget<TSchema, 'equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'equal', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'equal', target, value),
		)
	}

	notEqualTo<TTarget extends QueryFilterTarget<TSchema, 'not-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'not-equal', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'not-equal', target, value),
		)
	}

	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'greater-than', fieldName, value),
		)
	}

	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(
				state.schema,
				'greater-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'less-than', fieldName, value),
		)
	}

	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(
				state.schema,
				'less-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	between<TFieldName extends QueryFilterFieldName<TSchema, 'between'>>(
		fieldName: TFieldName,
		lower: AccessComparisonValue<TSchema, TFieldName>,
		upper: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryRangeFilter(state.schema, 'between', fieldName, lower, upper),
		)
	}

	notBetween<TFieldName extends QueryFilterFieldName<TSchema, 'not-between'>>(
		fieldName: TFieldName,
		lower: AccessComparisonValue<TSchema, TFieldName>,
		upper: AccessComparisonValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryRangeFilter(
				state.schema,
				'not-between',
				fieldName,
				lower,
				upper,
			),
		)
	}

	containedIn<TTarget extends QueryFilterTarget<TSchema, 'in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'in', TTarget>[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryMembershipFilter(state.schema, 'in', target, values),
		)
	}

	notContainedIn<TTarget extends QueryFilterTarget<TSchema, 'not-in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'not-in', TTarget>[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryMembershipFilter(state.schema, 'not-in', target, values),
		)
	}

	contains<TTarget extends QueryFilterTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contains', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryStructuralFilter(state.schema, 'contains', target, value),
		)
	}

	containedBy<TTarget extends QueryFilterTarget<TSchema, 'contained-by'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contained-by', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryStructuralFilter(state.schema, 'contained-by', target, value),
		)
	}

	hasKey<TTarget extends QueryFilterTarget<TSchema, 'has-key'>>(
		target: TTarget,
		key: QueryFilterOperand<TSchema, 'has-key', TTarget> & string,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryKeyFilter(state.schema, 'has-key', target, key),
		)
	}

	hasAnyKeys<TTarget extends QueryFilterTarget<TSchema, 'has-any-keys'>>(
		target: TTarget,
		keys: readonly (QueryFilterOperand<TSchema, 'has-any-keys', TTarget> &
			string)[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryKeyFilter(state.schema, 'has-any-keys', target, keys),
		)
	}

	hasAllKeys<TTarget extends QueryFilterTarget<TSchema, 'has-all-keys'>>(
		target: TTarget,
		keys: readonly (QueryFilterOperand<TSchema, 'has-all-keys', TTarget> &
			string)[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryKeyFilter(state.schema, 'has-all-keys', target, keys),
		)
	}

	jsonPathExists(
		target: QueryFilterTarget<TSchema, 'json-path-exists'>,
		expression: QueryJsonPathExpression,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryJsonPathFilter(
				state.schema,
				'json-path-exists',
				target,
				expression,
			),
		)
	}

	jsonPathMatches(
		target: QueryFilterTarget<TSchema, 'json-path-matches'>,
		expression: QueryJsonPathExpression,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryJsonPathFilter(
				state.schema,
				'json-path-matches',
				target,
				expression,
			),
		)
	}

	startsWith<TTarget extends QueryFilterTarget<TSchema, 'starts-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'starts-with', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'starts-with', target, value),
		)
	}

	endsWith<TTarget extends QueryFilterTarget<TSchema, 'ends-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'ends-with', TTarget>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'ends-with', target, value),
		)
	}

	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryRegexFilter(state.schema, fieldName, pattern),
		)
	}

	isNotNull(target: QueryFilterTarget<TSchema, 'null'>): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(createQueryNullFilter(state.schema, target, false))
	}

	isNull(target: QueryFilterTarget<TSchema, 'null'>): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(createQueryNullFilter(state.schema, target, true))
	}

	and(filter: AccessFilter<TSchema>): AccessFilter<TSchema> {
		return this.#combine(filter, 'and', false)
	}

	or(filter: AccessFilter<TSchema>): AccessFilter<TSchema> {
		return this.#combine(filter, 'or', false)
	}

	not(filter: AccessFilter<TSchema>): AccessFilter<TSchema> {
		return this.#combine(filter, 'and', true)
	}

	#append(
		expression: AccessFilterExpression<TSchema>,
		logicalKind: 'and' | 'or' = 'and',
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)
		const combined =
			state.expression === undefined
				? expression
				: logicalKind === 'and'
					? normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
							kind: 'and',
							expressions: [state.expression, expression],
						})
					: normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
							kind: 'or',
							expressions: [state.expression, expression],
						})

		return new ImmutableAccessFilter({
			schema: state.schema,
			expression: combined,
		})
	}

	#combine(
		filter: AccessFilter<TSchema>,
		logicalKind: 'and' | 'or',
		negate: boolean,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)
		const otherState = readAccessFilterState<TSchema>(filter)

		if (otherState.schema !== state.schema) {
			throw new TypeError('logical Access filters must use the same schema')
		}

		if (otherState.expression === undefined) {
			return new ImmutableAccessFilter(state)
		}

		const expression = negate
			? normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
					kind: 'not',
					expression: otherState.expression,
				})
			: otherState.expression

		return this.#append(expression, logicalKind)
	}
}

/** Creates one empty private Access predicate branch for a compiled rule. */
export const createAccessFilter = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
): AccessFilter<TSchema> => new ImmutableAccessFilter({ schema })

/** Reads one private normalized expression for Access compilation only. */
export const getAccessFilterExpression = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	filter: unknown,
): AccessFilterExpression<TSchema> | undefined => {
	const state = readAccessFilterState<TSchema>(filter)

	if (state.schema !== schema) {
		throw new TypeError('Access filter result must use the supplied schema')
	}

	return state.expression
}

/** Converts one callback result into the normalized predicate consumed by plans. */
export const normalizeAccessFilterResult = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	result: unknown,
): AccessFilterExpression<TSchema> => {
	if (typeof result === 'boolean') {
		return normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
			kind: 'constant',
			value: result,
		})
	}

	return (
		getAccessFilterExpression(schema, result) ??
		normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
			kind: 'constant',
			value: true,
		})
	)
}

/** ANDs independent policy results so no later contribution can broaden rows. */
export const combineAccessFilterResults = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	results: readonly unknown[],
): QueryFilterNode<TSchema> =>
	normalizeLogicalFilter<QueryPrimitiveFilterNode<TSchema>>({
		kind: 'and',
		expressions: results.map((result) =>
			normalizeAccessFilterResult(schema, result),
		),
	})
