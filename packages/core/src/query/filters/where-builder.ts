import {
	type SchemaDefinition,
	type SchemaPointerFieldName,
	type SchemaPointerTarget,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
	Schema,
} from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import type { QueryJsonPathExpression, QueryRegexPattern } from './primitive.js'
import {
	resolveRelationshipTarget,
	type QueryRelationPredicateOperator,
} from './relation.js'
import type {
	WhereBuilderOperand,
	WhereBuilderTarget,
	WhereInput,
	WhereOperatorFieldName,
	WhereRangeBound,
	WhereSource,
} from './where-contracts.js'
import {
	combineWhereExpressions,
	createConstantWhereExpression,
	normalizeWhereInput,
} from './where-normalize.js'
import {
	createWhereTargetInput,
	serializeWhereExpression,
	whereInputFromQueryFilter,
} from './where-serialize.js'

/** @internal Exposes one builder's immutable state to trusted Query modules. */
export interface WhereBuilderState<TSchema extends SchemaDefinition> {
	readonly expression: QueryFilterNode<TSchema> | undefined
	readonly schema: TSchema
}

let readState: <TSchema extends SchemaDefinition>(
	builder: WhereBuilder<TSchema>,
) => WhereBuilderState<TSchema>

/** @internal Reads one builder's state without adding a public accessor. */
export const readWhereBuilderState = <TSchema extends SchemaDefinition>(
	builder: WhereBuilder<TSchema>,
): WhereBuilderState<TSchema> => readState(builder)

/** Resolves every supported public where form through the same object normalizer. */
export const resolveWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereSource<TSchema>,
): QueryFilterNode<TSchema> => {
	if (input instanceof WhereBuilder) {
		const state = readWhereBuilderState(input)

		if (state.schema !== schema) {
			throw new TypeError('WhereBuilder must use the same schema definition')
		}

		return state.expression ?? createConstantWhereExpression<TSchema>(true)
	}

	if (typeof input === 'function') {
		const result = input(new WhereBuilder(schema))

		if (!(result instanceof WhereBuilder)) {
			throw new TypeError(
				'where callback must return the supplied WhereBuilder',
			)
		}

		return resolveWhereInput(schema, result)
	}

	return normalizeWhereInput(schema, input)
}

/** Builds schema-correlated where objects without becoming a second AST source. */
export class WhereBuilder<TSchema extends SchemaDefinition> {
	readonly #schema: TSchema
	// Assigned only while deriving a new frozen builder; never after it escapes.
	#expression: QueryFilterNode<TSchema> | undefined

	static {
		readState = (builder) => {
			if (!(#schema in builder)) {
				throw new TypeError('WhereBuilder has no internal state')
			}

			return immutableRecord({
				expression: builder.#expression,
				schema: builder.#schema,
			})
		}
	}

	constructor(schema: TSchema) {
		if (!Schema.is(schema)) {
			throw new TypeError('WhereBuilder schema must be a schema definition')
		}

		this.#schema = schema
		Object.freeze(this)
	}

	/** Returns the exact schema correlated with this immutable builder. */
	get schema(): TSchema {
		return this.#schema
	}

	/**
	 * Compares the visible cardinality of one relation.
	 * @example `where.count('comments', { gte: 3 })`
	 */
	count<TFieldName extends WhereOperatorFieldName<TSchema, 'count'>>(
		fieldName: TFieldName,
		input: WhereBuilderOperand<TSchema, 'count', TFieldName>,
	): WhereBuilder<TSchema> {
		return this.#operator(fieldName, 'count', input)
	}

	/**
	 * Requires one relation or one-dimensional field list to be empty.
	 * @example `where.isEmpty('tags')`
	 */
	isEmpty(
		fieldName: WhereOperatorFieldName<TSchema, 'isEmpty'>,
	): WhereBuilder<TSchema> {
		return this.#operator(fieldName, 'isEmpty', true)
	}

	/**
	 * Requires one field list to contain an exact element.
	 * @example `where.has('tags', 'typescript')`
	 */
	has<TTarget extends WhereBuilderTarget<TSchema, 'has'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'has', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'has', value)
	}

	/**
	 * Requires one field list to contain at least one requested element.
	 * @example `where.hasSome('tags', ['typescript', 'node'])`
	 */
	hasSome<TTarget extends WhereBuilderTarget<TSchema, 'hasSome'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'hasSome', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'hasSome', values)
	}

	/**
	 * Requires one field list to contain every requested element.
	 * @example `where.hasEvery('tags', ['backend', 'typescript'])`
	 */
	hasEvery<TTarget extends WhereBuilderTarget<TSchema, 'hasEvery'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'hasEvery', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'hasEvery', values)
	}

	/**
	 * Requires one relation to contain at least one visible target.
	 * @example `where.isNotEmpty('comments')`
	 */
	isNotEmpty(
		fieldName: WhereOperatorFieldName<TSchema, 'isNotEmpty'>,
	): WhereBuilder<TSchema> {
		return this.#operator(fieldName, 'isNotEmpty', true)
	}

	/**
	 * Compares one field or structured path for equality.
	 * @example `where.eq('published', true)`
	 */
	eq<TTarget extends WhereBuilderTarget<TSchema, 'eq'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'eq', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'eq', value)
	}

	/**
	 * Compares one field or structured path for inequality.
	 * @example `where.ne('status', 'archived')`
	 */
	ne<TTarget extends WhereBuilderTarget<TSchema, 'ne'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'ne', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'ne', value)
	}

	/**
	 * Adds one strict lower bound.
	 * @example `where.gt('views', 0)`
	 */
	gt<TTarget extends WhereBuilderTarget<TSchema, 'gt'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'gt', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'gt', value)
	}

	/**
	 * Adds one inclusive lower bound.
	 * @example `where.gte('views', 0)`
	 */
	gte<TTarget extends WhereBuilderTarget<TSchema, 'gte'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'gte', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'gte', value)
	}

	/**
	 * Adds one strict upper bound.
	 * @example `where.lt('views', 100)`
	 */
	lt<TTarget extends WhereBuilderTarget<TSchema, 'lt'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'lt', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'lt', value)
	}

	/**
	 * Adds one inclusive upper bound.
	 * @example `where.lte('views', 100)`
	 */
	lte<TTarget extends WhereBuilderTarget<TSchema, 'lte'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'lte', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'lte', value)
	}

	/**
	 * Requires one inclusive interval.
	 * @example `where.between('views', 10, 100)`
	 */
	between<TFieldName extends WhereOperatorFieldName<TSchema, 'between'>>(
		target: TFieldName,
		lower: WhereRangeBound<TSchema, 'between', TFieldName>,
		upper: WhereRangeBound<TSchema, 'between', TFieldName>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'between', immutableRecord({ lower, upper }))
	}

	/**
	 * Requires the inverse of one inclusive interval.
	 * @example `where.notBetween('views', 10, 100)`
	 */
	notBetween<TFieldName extends WhereOperatorFieldName<TSchema, 'notBetween'>>(
		target: TFieldName,
		lower: WhereRangeBound<TSchema, 'notBetween', TFieldName>,
		upper: WhereRangeBound<TSchema, 'notBetween', TFieldName>,
	): WhereBuilder<TSchema> {
		return this.#operator(
			target,
			'notBetween',
			immutableRecord({ lower, upper }),
		)
	}

	/**
	 * Requires membership in one immutable candidate list.
	 * @example `where.in('status', ['draft', 'published'])`
	 */
	in<TTarget extends WhereBuilderTarget<TSchema, 'in'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'in', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'in', values)
	}

	/**
	 * Excludes membership in one immutable candidate list.
	 * @example `where.notIn('status', ['archived'])`
	 */
	notIn<TTarget extends WhereBuilderTarget<TSchema, 'notIn'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'notIn', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'notIn', values)
	}

	/**
	 * Adds string or structural containment.
	 * @example `where.contains('title', 'Ultima')`
	 */
	contains<TTarget extends WhereBuilderTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'contains', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'contains', value)
	}

	/**
	 * Requires one structured target to be contained by the operand.
	 * @example `where.containedBy('metadata', { public: true })`
	 */
	containedBy<TTarget extends WhereBuilderTarget<TSchema, 'containedBy'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'containedBy', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'containedBy', value)
	}

	/**
	 * Adds one prefix match.
	 * @example `where.startsWith('title', 'Ultima')`
	 */
	startsWith<TTarget extends WhereBuilderTarget<TSchema, 'startsWith'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'startsWith', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'startsWith', value)
	}

	/**
	 * Adds one suffix match.
	 * @example `where.endsWith('title', 'Base')`
	 */
	endsWith<TTarget extends WhereBuilderTarget<TSchema, 'endsWith'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'endsWith', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'endsWith', value)
	}

	/**
	 * Tests one structured key.
	 * @example `where.hasKey('metadata', 'published')`
	 */
	hasKey<TTarget extends WhereBuilderTarget<TSchema, 'hasKey'>>(
		target: TTarget,
		key: WhereBuilderOperand<TSchema, 'hasKey', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'hasKey', key)
	}

	/**
	 * Tests whether any structured key exists.
	 * @example `where.hasAnyKeys('metadata', ['draft', 'published'])`
	 */
	hasAnyKeys<TTarget extends WhereBuilderTarget<TSchema, 'hasAnyKeys'>>(
		target: TTarget,
		keys: WhereBuilderOperand<TSchema, 'hasAnyKeys', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'hasAnyKeys', keys)
	}

	/**
	 * Tests whether every structured key exists.
	 * @example `where.hasAllKeys('metadata', ['title', 'slug'])`
	 */
	hasAllKeys<TTarget extends WhereBuilderTarget<TSchema, 'hasAllKeys'>>(
		target: TTarget,
		keys: WhereBuilderOperand<TSchema, 'hasAllKeys', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'hasAllKeys', keys)
	}

	/**
	 * Tests whether one JSONPath expression returns an item.
	 * @example `where.jsonPathExists('metadata', { source: '$.items[*]' })`
	 */
	jsonPathExists(
		target: WhereBuilderTarget<TSchema, 'jsonPathExists'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'jsonPathExists', expression)
	}

	/**
	 * Tests one JSONPath boolean expression.
	 * @example `where.jsonPathMatches('metadata', { source: '$.published == true' })`
	 */
	jsonPathMatches(
		target: WhereBuilderTarget<TSchema, 'jsonPathMatches'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'jsonPathMatches', expression)
	}

	/**
	 * Adds one declarative regular expression.
	 * @example `where.matches('title', { source: '^Ultima' })`
	 */
	matches(
		fieldName: WhereOperatorFieldName<TSchema, 'matches'>,
		pattern: QueryRegexPattern,
	): WhereBuilder<TSchema> {
		return this.#operator(fieldName, 'matches', pattern)
	}

	/**
	 * Requires one field or structured path to contain null.
	 * @example `where.isNull('deletedAt')`
	 */
	isNull(target: WhereBuilderTarget<TSchema, 'isNull'>): WhereBuilder<TSchema> {
		return this.#operator(target, 'isNull', true)
	}

	/**
	 * Requires one field or structured path to contain a non-null value.
	 * @example `where.isNotNull('publishedAt')`
	 */
	isNotNull(
		target: WhereBuilderTarget<TSchema, 'isNotNull'>,
	): WhereBuilder<TSchema> {
		return this.#operator(target, 'isNotNull', true)
	}

	/**
	 * Combines another filter through AND.
	 * @example `where.and({ published: { eq: true } })`
	 */
	and(input: WhereSource<TSchema>): WhereBuilder<TSchema> {
		return this.#combine(input, 'and', false)
	}

	/**
	 * Combines another filter through OR.
	 * @example `where.or({ featured: { eq: true } })`
	 */
	or(input: WhereSource<TSchema>): WhereBuilder<TSchema> {
		return this.#combine(input, 'or', false)
	}

	/**
	 * Negates another filter before combining it through AND.
	 * @example `where.not({ archived: { eq: true } })`
	 */
	not(input: WhereSource<TSchema>): WhereBuilder<TSchema> {
		return this.#combine(input, 'and', true)
	}

	/**
	 * Requires at least one related target to match.
	 * @example `where.some('tags', (tag) => tag.eq('label', 'typescript'))`
	 */
	some<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relationship('some', fieldName, input)
	}

	/**
	 * Requires no related target to match.
	 * @example `where.none('tags', { hidden: { eq: true } })`
	 */
	none<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relationship('none', fieldName, input)
	}

	/**
	 * Requires every related target to match.
	 * @example `where.every('tags', { visible: { eq: true } })`
	 */
	every<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relationship('every', fieldName, input)
	}

	/**
	 * Requires the object referenced by one pointer to match the target filter.
	 * @example `where.is('author', { active: { eq: true } })`
	 */
	is<TFieldName extends SchemaPointerFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaPointerTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relationship('is', fieldName, input)
	}

	/**
	 * Requires the object referenced by one pointer not to match the target filter.
	 * @example `where.isNot('author', { suspended: { eq: true } })`
	 */
	isNot<TFieldName extends SchemaPointerFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaPointerTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relationship('is-not', fieldName, input)
	}

	/**
	 * Returns the immutable object contract shared by direct and transport filters.
	 * @example `new WhereBuilder(Post).eq('published', true).build()`
	 */
	build(): WhereInput<TSchema> {
		return whereInputFromQueryFilter(
			this.#expression ?? createConstantWhereExpression<TSchema>(true),
		)
	}

	#derive(
		next: QueryFilterNode<TSchema>,
		kind: 'and' | 'or' = 'and',
	): WhereBuilder<TSchema> {
		const builder = new WhereBuilder(this.#schema)

		builder.#expression = combineWhereExpressions(this.#expression, next, kind)
		return builder
	}

	#operator(
		target: unknown,
		operator: string,
		operand: unknown,
	): WhereBuilder<TSchema> {
		// The object normalizer stays the single validation path for every method.
		return this.#derive(
			normalizeWhereInput(
				this.#schema,
				createWhereTargetInput(target, operator, operand),
			),
		)
	}

	#combine(
		input: WhereSource<TSchema>,
		kind: 'and' | 'or',
		negate: boolean,
	): WhereBuilder<TSchema> {
		const nested = resolveWhereInput(this.#schema, input)

		return this.#derive(
			negate
				? normalizeLogicalFilter({ kind: 'not', expression: nested })
				: nested,
			kind,
		)
	}

	#relationship(
		operator: QueryRelationPredicateOperator,
		fieldName: string,
		input: unknown,
	): WhereBuilder<TSchema> {
		const kind =
			operator === 'is' || operator === 'is-not' ? 'pointer' : 'relation'
		const target = resolveRelationshipTarget(this.#schema, fieldName, kind)

		if (target === undefined) {
			throw new TypeError(`WhereBuilder ${kind} must reference a ${kind} field`)
		}

		// The public method signature correlated the input with this exact target.
		const nested = resolveWhereInput(
			target,
			input as WhereSource<SchemaDefinition>,
		)

		return this.#operator(
			fieldName,
			operator === 'is-not' ? 'isNot' : operator,
			serializeWhereExpression(nested),
		)
	}
}
