import type { SchemaDefinition } from '../schema/definition.js'
import {
	createQueryMembershipFilter,
	createQueryNullFilter,
	createQueryRegexFilter,
	createQueryValueFilter,
} from '../../query/filters/factory.js'
import {
	normalizeLogicalFilter,
	type QueryFilterExpression,
	type QueryFilterNode,
} from '../../query/filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
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

type AccessStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

/** Implements the public capability interface without exporting construction. */
class ImmutableAccessFilter<
	const TSchema extends SchemaDefinition,
> implements AccessFilter<TSchema> {
	constructor(state: AccessFilterState<TSchema>) {
		accessFilterStates.set(this, state)
		Object.freeze(this)
	}

	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'equal', fieldName, value),
		)
	}

	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'not-equal', fieldName, value),
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

	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryMembershipFilter(state.schema, 'in', fieldName, values),
		)
	}

	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryMembershipFilter(state.schema, 'not-in', fieldName, values),
		)
	}

	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: AccessStringValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'contains', fieldName, value),
		)
	}

	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: AccessStringValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'starts-with', fieldName, value),
		)
	}

	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: AccessStringValue<TSchema, TFieldName>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(
			createQueryValueFilter(state.schema, 'ends-with', fieldName, value),
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

	isNotNull(
		fieldName: QueryFilterFieldName<TSchema, 'null'>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(createQueryNullFilter(state.schema, fieldName, false))
	}

	isNull(
		fieldName: QueryFilterFieldName<TSchema, 'null'>,
	): AccessFilter<TSchema> {
		const state = readAccessFilterState<TSchema>(this)

		return this.#append(createQueryNullFilter(state.schema, fieldName, true))
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
