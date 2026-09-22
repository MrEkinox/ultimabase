import {
	Schema,
	type SchemaDefinition,
	type SchemaPointerFieldName,
	type SchemaPointerTarget,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { immutableRecord } from '@ultimabase/shared'
import {
	createWhereRelationshipInput,
	createWhereTargetInput,
} from './where-builder-target.js'
import {
	readWhereBuilderState,
	storeWhereBuilderState,
} from './where-builder-state.js'
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
import { whereInputFromQueryFilter } from './where-serialize.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import type { QueryJsonPathExpression, QueryRegexPattern } from './primitive.js'
import type { QueryRelationQuantifierOperator } from './relation.js'

export const resolveWhereBuilderInput = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereSource<TSchema>,
): QueryFilterNode<TSchema> => {
	if (input instanceof WhereBuilder) {
		const state = readWhereBuilderState(input)

		if (state.schema !== schema) {
			throw new TypeError('WhereBuilder must use the same schema definition')
		}

		return normalizeWhereInput(schema, input.build())
	}

	if (typeof input === 'function') {
		const result = input(new WhereBuilder(schema))

		if (!(result instanceof WhereBuilder)) {
			throw new TypeError(
				'where callback must return the supplied WhereBuilder',
			)
		}

		return resolveWhereBuilderInput(schema, result)
	}

	return normalizeWhereInput(schema, input)
}

const createWhereBuilder = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	expression: QueryFilterNode<TSchema> | undefined,
): WhereBuilder<TSchema> => {
	const builder = new WhereBuilder(schema)

	storeWhereBuilderState(builder, immutableRecord({ expression, schema }))
	return builder
}

/** Builds schema-correlated where objects without becoming a second AST source. */
export class WhereBuilder<TSchema extends SchemaDefinition> {
	constructor(schema: TSchema) {
		if (!Schema.is(schema)) {
			throw new TypeError('WhereBuilder schema must be a schema definition')
		}

		storeWhereBuilderState(
			this,
			immutableRecord({ expression: undefined, schema }),
		)
		Object.freeze(this)
	}

	/** Returns the exact schema correlated with this immutable builder. */
	get schema(): TSchema {
		return readWhereBuilderState(this).schema
	}

	/**
	 * Compares the visible cardinality of one relation.
	 * @example `where.count('comments', { gte: 3 })`
	 */
	count<TFieldName extends WhereOperatorFieldName<TSchema, 'count'>>(
		fieldName: TFieldName,
		input: WhereBuilderOperand<TSchema, 'count', TFieldName>,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ count: input }),
			}),
		)
	}

	/**
	 * Requires one relation or one-dimensional field list to be empty.
	 * @example `where.isEmpty('tags')`
	 */
	isEmpty(
		fieldName: WhereOperatorFieldName<TSchema, 'isEmpty'>,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ isEmpty: true }),
			}),
		)
	}

	/**
	 * Requires one field list to contain an exact element.
	 * @example `where.has('tags', 'typescript')`
	 */
	has<TTarget extends WhereBuilderTarget<TSchema, 'has'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'has', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'has', value))
	}

	/**
	 * Requires one field list to contain at least one requested element.
	 * @example `where.hasSome('tags', ['typescript', 'node'])`
	 */
	hasSome<TTarget extends WhereBuilderTarget<TSchema, 'hasSome'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'hasSome', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasSome', values))
	}

	/**
	 * Requires one field list to contain every requested element.
	 * @example `where.hasEvery('tags', ['backend', 'typescript'])`
	 */
	hasEvery<TTarget extends WhereBuilderTarget<TSchema, 'hasEvery'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'hasEvery', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasEvery', values))
	}

	/**
	 * Requires one relation to contain at least one visible target.
	 * @example `where.isNotEmpty('comments')`
	 */
	isNotEmpty(
		fieldName: WhereOperatorFieldName<TSchema, 'isNotEmpty'>,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ isNotEmpty: true }),
			}),
		)
	}

	/**
	 * Compares one field or structured path for equality.
	 * @example `where.eq('published', true)`
	 */
	eq<TTarget extends WhereBuilderTarget<TSchema, 'eq'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'eq', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'eq', value))
	}

	/**
	 * Compares one field or structured path for inequality.
	 * @example `where.ne('status', 'archived')`
	 */
	ne<TTarget extends WhereBuilderTarget<TSchema, 'ne'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'ne', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'ne', value))
	}

	/**
	 * Adds one strict lower bound.
	 * @example `where.gt('views', 0)`
	 */
	gt<TTarget extends WhereBuilderTarget<TSchema, 'gt'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'gt', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gt', value))
	}

	/**
	 * Adds one inclusive lower bound.
	 * @example `where.gte('views', 0)`
	 */
	gte<TTarget extends WhereBuilderTarget<TSchema, 'gte'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'gte', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gte', value))
	}

	/**
	 * Adds one strict upper bound.
	 * @example `where.lt('views', 100)`
	 */
	lt<TTarget extends WhereBuilderTarget<TSchema, 'lt'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'lt', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lt', value))
	}

	/**
	 * Adds one inclusive upper bound.
	 * @example `where.lte('views', 100)`
	 */
	lte<TTarget extends WhereBuilderTarget<TSchema, 'lte'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'lte', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lte', value))
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
		return this.#append(
			createWhereTargetInput(
				target,
				'between',
				immutableRecord({ lower, upper }),
			),
		)
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
		return this.#append(
			createWhereTargetInput(
				target,
				'notBetween',
				immutableRecord({ lower, upper }),
			),
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
		return this.#append(createWhereTargetInput(target, 'in', values))
	}

	/**
	 * Excludes membership in one immutable candidate list.
	 * @example `where.notIn('status', ['archived'])`
	 */
	notIn<TTarget extends WhereBuilderTarget<TSchema, 'notIn'>>(
		target: TTarget,
		values: WhereBuilderOperand<TSchema, 'notIn', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'notIn', values))
	}

	/**
	 * Adds string or structural containment.
	 * @example `where.contains('title', 'Ultima')`
	 */
	contains<TTarget extends WhereBuilderTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'contains', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'contains', value))
	}

	/**
	 * Requires one structured target to be contained by the operand.
	 * @example `where.containedBy('metadata', { public: true })`
	 */
	containedBy<TTarget extends WhereBuilderTarget<TSchema, 'containedBy'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'containedBy', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'containedBy', value))
	}

	/**
	 * Adds one prefix match.
	 * @example `where.startsWith('title', 'Ultima')`
	 */
	startsWith<TTarget extends WhereBuilderTarget<TSchema, 'startsWith'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'startsWith', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'startsWith', value))
	}

	/**
	 * Adds one suffix match.
	 * @example `where.endsWith('title', 'Base')`
	 */
	endsWith<TTarget extends WhereBuilderTarget<TSchema, 'endsWith'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'endsWith', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'endsWith', value))
	}

	/**
	 * Tests one structured key.
	 * @example `where.hasKey('metadata', 'published')`
	 */
	hasKey<TTarget extends WhereBuilderTarget<TSchema, 'hasKey'>>(
		target: TTarget,
		key: WhereBuilderOperand<TSchema, 'hasKey', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasKey', key))
	}

	/**
	 * Tests whether any structured key exists.
	 * @example `where.hasAnyKeys('metadata', ['draft', 'published'])`
	 */
	hasAnyKeys<TTarget extends WhereBuilderTarget<TSchema, 'hasAnyKeys'>>(
		target: TTarget,
		keys: WhereBuilderOperand<TSchema, 'hasAnyKeys', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAnyKeys', keys))
	}

	/**
	 * Tests whether every structured key exists.
	 * @example `where.hasAllKeys('metadata', ['title', 'slug'])`
	 */
	hasAllKeys<TTarget extends WhereBuilderTarget<TSchema, 'hasAllKeys'>>(
		target: TTarget,
		keys: WhereBuilderOperand<TSchema, 'hasAllKeys', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAllKeys', keys))
	}

	/**
	 * Tests whether one JSONPath expression returns an item.
	 * @example `where.jsonPathExists('metadata', { source: '$.items[*]' })`
	 */
	jsonPathExists(
		target: WhereBuilderTarget<TSchema, 'jsonPathExists'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#append(
			createWhereTargetInput(target, 'jsonPathExists', expression),
		)
	}

	/**
	 * Tests one JSONPath boolean expression.
	 * @example `where.jsonPathMatches('metadata', { source: '$.published == true' })`
	 */
	jsonPathMatches(
		target: WhereBuilderTarget<TSchema, 'jsonPathMatches'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#append(
			createWhereTargetInput(target, 'jsonPathMatches', expression),
		)
	}

	/**
	 * Adds one declarative regular expression.
	 * @example `where.matches('title', { source: '^Ultima' })`
	 */
	matches(
		fieldName: WhereOperatorFieldName<TSchema, 'matches'>,
		pattern: QueryRegexPattern,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(fieldName, 'matches', pattern))
	}

	/**
	 * Requires one field or structured path to contain null.
	 * @example `where.isNull('deletedAt')`
	 */
	isNull(target: WhereBuilderTarget<TSchema, 'isNull'>): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'isNull', true))
	}

	/**
	 * Requires one field or structured path to contain a non-null value.
	 * @example `where.isNotNull('publishedAt')`
	 */
	isNotNull(
		target: WhereBuilderTarget<TSchema, 'isNotNull'>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'isNotNull', true))
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
		return this.#relation('some', fieldName, input)
	}

	/**
	 * Requires no related target to match.
	 * @example `where.none('tags', { hidden: { eq: true } })`
	 */
	none<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relation('none', fieldName, input)
	}

	/**
	 * Requires every related target to match.
	 * @example `where.every('tags', { visible: { eq: true } })`
	 */
	every<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relation('every', fieldName, input)
	}

	/**
	 * Requires the object referenced by one pointer to match the target filter.
	 * @example `where.is('author', { active: { eq: true } })`
	 */
	is<TFieldName extends SchemaPointerFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaPointerTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#pointer('is', fieldName, input)
	}

	/**
	 * Requires the object referenced by one pointer not to match the target filter.
	 * @example `where.isNot('author', { suspended: { eq: true } })`
	 */
	isNot<TFieldName extends SchemaPointerFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaPointerTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#pointer('is-not', fieldName, input)
	}

	/**
	 * Returns the immutable object contract shared by direct and transport filters.
	 * @example `new WhereBuilder(Post).eq('published', true).build()`
	 */
	build(): WhereInput<TSchema> {
		const expression = readWhereBuilderState(this).expression

		return whereInputFromQueryFilter(
			expression ?? createConstantWhereExpression<TSchema>(true),
		)
	}

	#append(input: WhereInput<TSchema>): WhereBuilder<TSchema> {
		const state = readWhereBuilderState(this)
		const next = normalizeWhereInput(state.schema, input)

		return createWhereBuilder(
			state.schema,
			combineWhereExpressions(state.expression, next),
		)
	}

	#combine(
		input: WhereSource<TSchema>,
		kind: 'and' | 'or',
		negate: boolean,
	): WhereBuilder<TSchema> {
		const state = readWhereBuilderState(this)
		const nested = resolveWhereBuilderInput(state.schema, input)
		const next = negate
			? normalizeLogicalFilter({ kind: 'not', expression: nested })
			: nested

		return createWhereBuilder(
			state.schema,
			combineWhereExpressions(state.expression, next, kind),
		)
	}

	#relation<TFieldName extends SchemaRelationFieldName<TSchema>>(
		operator: QueryRelationQuantifierOperator,
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		const state = readWhereBuilderState(this)
		const field = state.schema.persistedFields[fieldName]
		const target =
			field === undefined ? undefined : getFieldSchemaTarget(field)?.()

		if (field?.kind !== 'relation' || !Schema.is(target)) {
			throw new TypeError(
				'WhereBuilder relation must reference a relation field',
			)
		}

		const nested = resolveWhereBuilderInput(
			target,
			input as unknown as WhereSource<typeof target>,
		)
		return this.#append(
			createWhereRelationshipInput<TSchema, typeof target>(
				fieldName,
				operator,
				nested,
			),
		)
	}

	#pointer<TFieldName extends SchemaPointerFieldName<TSchema>>(
		operator: 'is' | 'is-not',
		fieldName: TFieldName,
		input: WhereSource<SchemaPointerTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		const state = readWhereBuilderState(this)
		const field = state.schema.persistedFields[fieldName]
		const target =
			field === undefined ? undefined : getFieldSchemaTarget(field)?.()

		if (field?.kind !== 'pointer' || !Schema.is(target)) {
			throw new TypeError('WhereBuilder pointer must reference a pointer field')
		}

		const nested = resolveWhereBuilderInput(
			target,
			input as unknown as WhereSource<typeof target>,
		)
		return this.#append(
			createWhereRelationshipInput<TSchema, typeof target>(
				fieldName,
				operator === 'is-not' ? 'isNot' : 'is',
				nested,
			),
		)
	}
}
