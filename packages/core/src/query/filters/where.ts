import {
	Pointer,
	Schema,
	type SchemaDefinition,
	type SchemaPointerFieldName,
	type SchemaPointerTarget,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import type {
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
import type { ReservedQueryLogicalFieldName } from '../../schema/schema/reserved-field-names.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryFieldName } from '../ast/contracts.js'
import { parsePersistedQueryFieldName as parseQueryFieldName } from '../ast/schema.js'
import {
	createQueryJsonPathFilter,
	createQueryKeyFilter,
	createQueryListFilter,
	createQueryMembershipFilter,
	createQueryNullFilter,
	createQueryRangeFilter,
	createQueryRegexFilter,
	createQueryStructuralFilter,
	createQueryValueFilter,
	fieldPath,
} from './factory.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import {
	createQueryRelationCount,
	createQueryRelationDepthError,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
	queryRelationPredicateMaxDepth,
	type QueryRelationCountInput,
	type QueryRelationFilterNode,
	type QueryRelationPredicateNode,
	type QueryRelationPredicateOperator,
	type QueryRelationQuantifierOperator,
	type QueryPointerPredicateNode,
} from './relation.js'
import type {
	QueryComparisonFilterNode,
	QueryEqualityFilterNode,
	QueryFieldPath,
	QueryFilterTarget,
	QueryJsonPathExpression,
	QueryJsonPathFilterNode,
	QueryKeyFilterNode,
	QueryKeysFilterNode,
	QueryListEmptyFilterNode,
	QueryListHasFilterNode,
	QueryListMembershipFilterNode,
	QueryMembershipFilterNode,
	QueryNullFilterNode,
	QueryRangeFilterNode,
	QueryRegexFilterNode,
	QueryRegexPattern,
	QueryStringFilterNode,
	QueryStructuralContainmentFilterNode,
} from './primitive.js'

export type WhereLogicalKey = ReservedQueryLogicalFieldName

/** Describes one schema-correlated, transport-neutral filter object. */
export type WhereInput<TSchema extends SchemaTypeInfoSource> = SchemaTypeValue<
	TSchema,
	'Where'
>

type WhereFieldName<TSchema extends SchemaDefinition> = Exclude<
	Extract<keyof WhereInput<TSchema>, string>,
	WhereLogicalKey
>

type WhereFieldFilter<
	TSchema extends SchemaDefinition,
	TFieldName extends string,
> = TFieldName extends keyof WhereInput<TSchema>
	? NonNullable<WhereInput<TSchema>[TFieldName]>
	: unknown

type WhereOperatorFieldName<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	string extends WhereFieldName<TSchema>
		? string
		: {
				[
					TFieldName in WhereFieldName<TSchema>
				]: TOperator extends keyof WhereFieldFilter<TSchema, TFieldName>
					? TFieldName
					: never
			}[WhereFieldName<TSchema>]

type WherePathEntry<
	TSchema extends SchemaDefinition,
	TFieldName extends WhereFieldName<TSchema>,
> =
	WhereFieldFilter<TSchema, TFieldName> extends {
		readonly at?: readonly (infer TEntry)[]
	}
		? TEntry
		: never

type WherePathTargetForEntry<
	TFieldName extends string,
	TOperator extends string,
	TEntry,
> = TEntry extends {
	readonly path: infer TPath extends readonly [string, ...string[]]
}
	? TOperator extends keyof TEntry
		? QueryFieldPath<TFieldName, TPath>
		: never
	: never

type WherePathTarget<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	string extends WhereFieldName<TSchema>
		? QueryFieldPath<string, readonly [string, ...string[]]>
		: {
				[TFieldName in WhereFieldName<TSchema>]: WherePathTargetForEntry<
					TFieldName,
					TOperator,
					WherePathEntry<TSchema, TFieldName>
				>
			}[WhereFieldName<TSchema>]

type WhereBuilderTarget<
	TSchema extends SchemaDefinition,
	TOperator extends string,
> =
	| WhereOperatorFieldName<TSchema, TOperator>
	| WherePathTarget<TSchema, TOperator>

type WhereTargetFilter<TSchema extends SchemaDefinition, TTarget> =
	TTarget extends QueryFieldPath<
		infer TFieldName extends WhereFieldName<TSchema>,
		infer TPath
	>
		? Extract<WherePathEntry<TSchema, TFieldName>, { readonly path: TPath }>
		: TTarget extends WhereFieldName<TSchema>
			? WhereFieldFilter<TSchema, TTarget>
			: never

type WhereBuilderOperand<
	TSchema extends SchemaDefinition,
	TOperator extends string,
	TTarget,
> =
	string extends WhereFieldName<TSchema>
		? unknown
		: TOperator extends keyof WhereTargetFilter<TSchema, TTarget>
			? Exclude<WhereTargetFilter<TSchema, TTarget>[TOperator], undefined>
			: unknown

type WhereRangeBound<
	TSchema extends SchemaDefinition,
	TOperator extends 'between' | 'notBetween',
	TFieldName extends WhereOperatorFieldName<TSchema, TOperator>,
> =
	WhereBuilderOperand<TSchema, TOperator, TFieldName> extends {
		readonly lower: infer TLower
		readonly upper: infer TUpper
	}
		? TLower & TUpper
		: unknown

/** Builds one where object through the immutable utility class. */
export type WhereCallback<TSchema extends SchemaDefinition> = (
	builder: WhereBuilder<TSchema>,
) => WhereBuilder<TSchema>

/** Accepts direct, reusable, or callback-built forms of the same where contract. */
export type WhereSource<TSchema extends SchemaDefinition> =
	WhereBuilder<TSchema> | WhereInput<TSchema> | WhereCallback<TSchema>

interface WhereBuilderState<TSchema extends SchemaDefinition> {
	readonly expression: QueryFilterNode<TSchema> | undefined
	readonly schema: TSchema
}

const whereBuilderStates = new WeakMap<object, unknown>()

const readWhereBuilderState = <TSchema extends SchemaDefinition>(
	builder: WhereBuilder<TSchema>,
): WhereBuilderState<TSchema> => {
	const state = whereBuilderStates.get(builder)

	if (state === undefined) {
		throw new TypeError('WhereBuilder has no internal state')
	}

	return state as unknown as WhereBuilderState<TSchema>
}

const combineWhereExpressions = <TSchema extends SchemaDefinition>(
	left: QueryFilterNode<TSchema> | undefined,
	right: QueryFilterNode<TSchema>,
	kind: 'and' | 'or' = 'and',
): QueryFilterNode<TSchema> =>
	left === undefined
		? right
		: normalizeLogicalFilter({
				kind,
				expressions: [left, right],
			})

const createConstantWhereExpression = <TSchema extends SchemaDefinition>(
	value: boolean,
): QueryFilterNode<TSchema> => immutableRecord({ kind: 'constant', value })

const normalizeWhereRelationship = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	operator: QueryRelationPredicateOperator,
	input: unknown,
	relationDepth: number,
	ancestors: WeakSet<object>,
):
	| QueryPointerPredicateNode<TSchema, QueryFieldName<TSchema>>
	| QueryRelationPredicateNode<TSchema, QueryFieldName<TSchema>> => {
	if (relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	const field = schema.persistedFields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	const expectedKind =
		operator === 'is' || operator === 'is-not' ? 'pointer' : 'relation'

	if (field?.kind !== expectedKind || !Schema.is(target)) {
		throw new TypeError(
			`where.${fieldName}.${operator} requires a ${expectedKind} field`,
		)
	}

	const expression = normalizeWhereRecord(
		target,
		input,
		relationDepth + 1,
		ancestors,
	)

	return immutableRecord({
		kind: 'relation-predicate',
		operator,
		field: fieldName,
		source: createQueryAst(schema).schema,
		target: createQueryAst(target).schema,
		expression,
	})
}

const normalizeWhereRelationCount = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
	relationDepth: number,
	ancestors: WeakSet<object>,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`where.${fieldName}.count must be an object`)
	}

	const field = schema.persistedFields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	if (field?.kind !== 'relation' || !Schema.is(target)) {
		throw new TypeError(`where.${fieldName}.count requires a relation field`)
	}
	const relationFieldName =
		fieldName as unknown as SchemaRelationFieldName<TSchema>
	type RelationTarget = SchemaRelationTarget<TSchema, typeof relationFieldName>
	const exactTarget = target as unknown as RelationTarget

	const hasWhere = Object.hasOwn(input, 'where')
	const comparisonEntries = Object.entries(input).filter(
		([operator]) => operator !== 'where',
	)

	for (const [operator] of comparisonEntries) {
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
			throw new TypeError(
				`where.${fieldName}.count.${operator} is not a supported where operator`,
			)
		}
	}

	if (comparisonEntries.length === 0) {
		throw new TypeError(`where.${fieldName}.count must contain an operator`)
	}

	if (hasWhere && relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	const expression: QueryFilterNode<RelationTarget> = hasWhere
		? normalizeWhereRecord(
				exactTarget,
				input.where,
				relationDepth + 1,
				ancestors,
			)
		: createConstantWhereExpression<typeof exactTarget>(true)
	const comparisons = immutableRecord(
		Object.fromEntries(comparisonEntries),
	) as QueryRelationCountInput

	return createQueryRelationCount(
		schema,
		relationFieldName,
		comparisons,
		expression,
	)
}

const assertExactRangeInput = (
	input: unknown,
	path: string,
): Readonly<{ lower: unknown; upper: unknown }> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	const keys = Object.keys(input)

	if (
		keys.length !== 2 ||
		!Object.hasOwn(input, 'lower') ||
		!Object.hasOwn(input, 'upper')
	) {
		throw new TypeError(`${path} must contain only lower and upper`)
	}

	return { lower: input.lower, upper: input.upper }
}

const assertEnabledWhereFlag = (input: unknown, path: string): void => {
	if (input !== true) {
		throw new TypeError(`${path} must be true`)
	}
}

const normalizePointerIdentityOperand = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: QueryFieldName<TSchema> | QueryFieldPath,
	operand: unknown,
	path: string,
): unknown => {
	if (typeof target !== 'string') return operand
	const pointer = schema.persistedFields[target]
	if (pointer?.kind !== 'pointer') return operand

	const targetSchema = getFieldSchemaTarget(pointer)?.()

	if (!Schema.is(targetSchema)) {
		throw new TypeError(`${path} requires a registered pointer target`)
	}

	if (typeof operand !== 'string') {
		throw new TypeError(`${path} must be a target object id`)
	}

	return new Pointer(targetSchema, operand)
}

const normalizeWhereOperator = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: QueryFieldName<TSchema> | QueryFieldPath,
	operator: string,
	operand: unknown,
	path: string,
): QueryFilterNode<TSchema> => {
	switch (operator) {
		case 'eq':
			return createQueryValueFilter(
				schema,
				'equal',
				target,
				normalizePointerIdentityOperand(schema, target, operand, path),
			)
		case 'ne':
			return createQueryValueFilter(
				schema,
				'not-equal',
				target,
				normalizePointerIdentityOperand(schema, target, operand, path),
			)
		case 'gt':
			return createQueryValueFilter(schema, 'greater-than', target, operand)
		case 'gte':
			return createQueryValueFilter(
				schema,
				'greater-than-or-equal',
				target,
				operand,
			)
		case 'lt':
			return createQueryValueFilter(schema, 'less-than', target, operand)
		case 'lte':
			return createQueryValueFilter(
				schema,
				'less-than-or-equal',
				target,
				operand,
			)
		case 'between':
		case 'notBetween': {
			if (typeof target !== 'string') {
				throw new TypeError(`${path} does not support field paths`)
			}

			const range = assertExactRangeInput(operand, path)

			return createQueryRangeFilter(
				schema,
				operator === 'between' ? 'between' : 'not-between',
				target,
				range.lower,
				range.upper,
			)
		}
		case 'in':
		case 'notIn':
			if (!isUnknownArray(operand)) {
				throw new TypeError(`${path} must be an array`)
			}

			return createQueryMembershipFilter(
				schema,
				operator === 'in' ? 'in' : 'not-in',
				target,
				operand.map((value, index) =>
					normalizePointerIdentityOperand(
						schema,
						target,
						value,
						`${path}[${String(index)}]`,
					),
				),
			)
		case 'has':
			return createQueryListFilter(schema, 'list-has', target, operand)
		case 'hasSome':
		case 'hasEvery':
			if (!isUnknownArray(operand)) {
				throw new TypeError(`${path} must be an array`)
			}

			return createQueryListFilter(
				schema,
				operator === 'hasSome' ? 'list-has-some' : 'list-has-every',
				target,
				operand,
			)
		case 'isEmpty':
			assertEnabledWhereFlag(operand, path)
			return createQueryListFilter(schema, 'list-empty', target)
		case 'contains':
			return createQueryStructuralFilter(
				schema,
				'contains',
				target as QueryFilterTarget<TSchema, 'contains'>,
				operand,
			)
		case 'containedBy':
			return createQueryStructuralFilter(
				schema,
				'contained-by',
				target as QueryFilterTarget<TSchema, 'contained-by'>,
				operand,
			)
		case 'startsWith':
			return createQueryValueFilter(schema, 'starts-with', target, operand)
		case 'endsWith':
			return createQueryValueFilter(schema, 'ends-with', target, operand)
		case 'hasKey':
		case 'hasAnyKeys':
		case 'hasAllKeys':
			return createQueryKeyFilter(
				schema,
				operator === 'hasKey'
					? 'has-key'
					: operator === 'hasAnyKeys'
						? 'has-any-keys'
						: 'has-all-keys',
				target as QueryFilterTarget<
					TSchema,
					'has-all-keys' | 'has-any-keys' | 'has-key'
				>,
				operand as string | readonly string[],
			)
		case 'jsonPathExists':
		case 'jsonPathMatches':
			return createQueryJsonPathFilter(
				schema,
				operator === 'jsonPathExists'
					? 'json-path-exists'
					: 'json-path-matches',
				target as QueryFilterTarget<
					TSchema,
					'json-path-exists' | 'json-path-matches'
				>,
				operand as QueryJsonPathExpression,
			)
		case 'matches':
			if (typeof target !== 'string') {
				throw new TypeError(`${path} does not support field paths`)
			}

			return createQueryRegexFilter(
				schema,
				target,
				operand as QueryRegexPattern,
			)
		case 'isNull':
		case 'isNotNull':
			assertEnabledWhereFlag(operand, path)
			return createQueryNullFilter(schema, target, operator === 'isNull')
		default:
			throw new TypeError(`${path} is not a supported where operator`)
	}
}

const normalizeWhereFieldOperators = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
	relationDepth: number,
	ancestors: WeakSet<object>,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`where.${fieldName} must be an object`)
	}

	let expression: QueryFilterNode<TSchema> | undefined

	for (const [operator, operand] of Object.entries(input)) {
		if (
			(operator === 'isEmpty' || operator === 'isNotEmpty') &&
			schema.persistedFields[fieldName]?.kind === 'relation'
		) {
			assertEnabledWhereFlag(operand, `where.${fieldName}.${operator}`)
			expression = combineWhereExpressions(
				expression,
				normalizeWhereRelationship(
					schema,
					fieldName,
					operator === 'isEmpty' ? 'none' : 'some',
					immutableRecord({}),
					relationDepth,
					ancestors,
				) as unknown as QueryFilterNode<TSchema>,
			)
			continue
		}

		if (operator === 'count') {
			expression = combineWhereExpressions(
				expression,
				normalizeWhereRelationCount(
					schema,
					fieldName,
					operand,
					relationDepth,
					ancestors,
				),
			)
			continue
		}

		if (operator === 'at') {
			if (!isUnknownArray(operand)) {
				throw new TypeError(`where.${fieldName}.at must be an array`)
			}

			for (const [index, pathInput] of operand.entries()) {
				if (!isPlainRecord(pathInput) || !Object.hasOwn(pathInput, 'path')) {
					throw new TypeError(
						`where.${fieldName}.at[${String(index)}] must contain path`,
					)
				}

				const path = pathInput.path

				if (
					!isUnknownArray(path) ||
					path.length === 0 ||
					!path.every((segment) => typeof segment === 'string')
				) {
					throw new TypeError(
						`where.${fieldName}.at[${String(index)}].path must be a non-empty string array`,
					)
				}

				const target = fieldPath(
					fieldName,
					path as unknown as readonly [string, ...string[]],
				)
				let pathExpression: QueryFilterNode<TSchema> | undefined

				for (const [pathOperator, pathOperand] of Object.entries(pathInput)) {
					if (pathOperator === 'path') {
						continue
					}

					pathExpression = combineWhereExpressions(
						pathExpression,
						normalizeWhereOperator(
							schema,
							target,
							pathOperator,
							pathOperand,
							`where.${fieldName}.at[${String(index)}].${pathOperator}`,
						),
					)
				}

				if (pathExpression === undefined) {
					throw new TypeError(
						`where.${fieldName}.at[${String(index)}] must contain an operator`,
					)
				}

				expression = combineWhereExpressions(expression, pathExpression)
			}

			continue
		}

		if (
			operator === 'some' ||
			operator === 'none' ||
			operator === 'every' ||
			operator === 'is' ||
			operator === 'isNot'
		) {
			expression = combineWhereExpressions(
				expression,
				normalizeWhereRelationship(
					schema,
					fieldName,
					operator === 'isNot' ? 'is-not' : operator,
					operand,
					relationDepth,
					ancestors,
				) as unknown as QueryFilterNode<TSchema>,
			)
			continue
		}

		expression = combineWhereExpressions(
			expression,
			normalizeWhereOperator(
				schema,
				fieldName,
				operator,
				operand,
				`where.${fieldName}.${operator}`,
			),
		)
	}

	if (expression === undefined) {
		throw new TypeError(`where.${fieldName} must contain an operator`)
	}

	return expression
}

const normalizeWhereRecord = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: unknown,
	relationDepth: number,
	ancestors: WeakSet<object>,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError('where must be an object')
	}

	if (ancestors.has(input)) {
		throw new TypeError('where must not contain circular references')
	}

	ancestors.add(input)

	try {
		let expression: QueryFilterNode<TSchema> | undefined

		for (const [key, value] of Object.entries(input)) {
			if (key === 'AND' || key === 'OR') {
				if (!isUnknownArray(value)) {
					throw new TypeError(`where.${key} must be an array`)
				}

				const expressions = value.map((item) =>
					normalizeWhereRecord(schema, item, relationDepth, ancestors),
				)
				const logical = normalizeLogicalFilter({
					kind: key === 'AND' ? 'and' : 'or',
					expressions,
				}) as QueryFilterNode<TSchema>

				expression = combineWhereExpressions(expression, logical)
				continue
			}

			if (key === 'NOT') {
				const nested = normalizeWhereRecord(
					schema,
					value,
					relationDepth,
					ancestors,
				)
				const logical = normalizeLogicalFilter({
					kind: 'not',
					expression: nested,
				}) as QueryFilterNode<TSchema>

				expression = combineWhereExpressions(expression, logical)
				continue
			}

			const fieldName = parseQueryFieldName(schema, key, `where.${key}`)

			expression = combineWhereExpressions(
				expression,
				normalizeWhereFieldOperators(
					schema,
					fieldName,
					value,
					relationDepth,
					ancestors,
				),
			)
		}

		return expression ?? createConstantWhereExpression(true)
	} finally {
		ancestors.delete(input)
	}
}

/** Validates and snapshots one public where object into the existing QueryBuilder AST. */
export const normalizeWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereInput<TSchema>,
): QueryFilterNode<TSchema> =>
	normalizeWhereRecord(schema, input, 0, new WeakSet<object>())

const shortOperatorForKind = (kind: string): string => {
	switch (kind) {
		case 'equal':
			return 'eq'
		case 'not-equal':
			return 'ne'
		case 'greater-than':
			return 'gt'
		case 'greater-than-or-equal':
			return 'gte'
		case 'less-than':
			return 'lt'
		case 'less-than-or-equal':
			return 'lte'
		case 'not-between':
			return 'notBetween'
		case 'not-in':
			return 'notIn'
		case 'list-has':
			return 'has'
		case 'list-has-every':
			return 'hasEvery'
		case 'list-has-some':
			return 'hasSome'
		case 'list-empty':
			return 'isEmpty'
		case 'contained-by':
			return 'containedBy'
		case 'starts-with':
			return 'startsWith'
		case 'ends-with':
			return 'endsWith'
		case 'has-key':
			return 'hasKey'
		case 'has-any-keys':
			return 'hasAnyKeys'
		case 'has-all-keys':
			return 'hasAllKeys'
		case 'json-path-exists':
			return 'jsonPathExists'
		case 'json-path-matches':
			return 'jsonPathMatches'
		case 'regex':
			return 'matches'
		default:
			return kind
	}
}

type SerializableWherePrimitive =
	| QueryComparisonFilterNode
	| QueryEqualityFilterNode
	| QueryJsonPathFilterNode
	| QueryKeyFilterNode
	| QueryKeysFilterNode
	| QueryListEmptyFilterNode
	| QueryListHasFilterNode
	| QueryListMembershipFilterNode
	| QueryMembershipFilterNode
	| QueryNullFilterNode
	| QueryRangeFilterNode
	| QueryRegexFilterNode
	| QueryStringFilterNode
	| QueryStructuralContainmentFilterNode

const serializeWhereLeaf = (
	expression: SerializableWherePrimitive | QueryRelationFilterNode,
): Readonly<Record<string, unknown>> => {
	if (isQueryRelationCountNode(expression)) {
		const comparisons = Object.fromEntries(
			expression.comparisons.map((comparison): readonly [string, unknown] => {
				const operator = shortOperatorForKind(comparison.operator)

				if (
					comparison.operator === 'between' ||
					comparison.operator === 'not-between'
				) {
					return [
						operator,
						immutableRecord({
							lower: comparison.lower,
							upper: comparison.upper,
						}),
					]
				}

				if (comparison.operator === 'in' || comparison.operator === 'not-in') {
					return [operator, comparison.values]
				}

				if ('value' in comparison) {
					return [operator, comparison.value]
				}

				throw new TypeError('Unsupported relation count comparison')
			}),
		)
		const countInput = immutableRecord({
			...comparisons,
			...(expression.expression.kind === 'constant' &&
			expression.expression.value
				? {}
				: { where: serializeWhereExpression(expression.expression) }),
		})

		return immutableRecord({
			[expression.field]: immutableRecord({
				count: countInput,
			}),
		})
	}

	if (isQueryRelationPredicateNode(expression)) {
		return immutableRecord({
			[expression.field]: immutableRecord({
				[expression.operator === 'is-not' ? 'isNot' : expression.operator]:
					serializeWhereExpression(expression.expression),
			}),
		})
	}

	const operator =
		expression.kind === 'null'
			? expression.isNull
				? 'isNull'
				: 'isNotNull'
			: shortOperatorForKind(expression.kind)
	let operand: unknown

	if (expression.kind === 'between' || expression.kind === 'not-between') {
		operand = immutableRecord({
			lower: expression.lower,
			upper: expression.upper,
		})
	} else if (
		expression.kind === 'in' ||
		expression.kind === 'not-in' ||
		expression.kind === 'list-has-every' ||
		expression.kind === 'list-has-some'
	) {
		operand = immutableArray(
			expression.values.map((value) => (Pointer.is(value) ? value.id : value)),
		)
	} else if (
		expression.kind === 'has-all-keys' ||
		expression.kind === 'has-any-keys'
	) {
		operand = expression.keys
	} else if (
		expression.kind === 'json-path-exists' ||
		expression.kind === 'json-path-matches'
	) {
		operand = immutableRecord({
			source: expression.source,
			...(expression.variables === undefined
				? {}
				: { variables: expression.variables }),
		})
	} else if (expression.kind === 'regex') {
		operand = expression.pattern
	} else if (expression.kind === 'null' || expression.kind === 'list-empty') {
		operand = true
	} else if ('value' in expression) {
		operand = Pointer.is(expression.value)
			? expression.value.id
			: expression.value
	} else {
		throw new TypeError('Unsupported where expression kind')
	}

	const operatorInput = immutableRecord({ [operator]: operand })

	return 'path' in expression
		? immutableRecord({
				[expression.field]: immutableRecord({
					at: immutableArray([
						immutableRecord({ path: expression.path, ...operatorInput }),
					]),
				}),
			})
		: immutableRecord({ [expression.field]: operatorInput })
}

const serializeWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): Readonly<Record<string, unknown>> => {
	switch (expression.kind) {
		case 'constant':
			return expression.value
				? immutableRecord({})
				: immutableRecord({ OR: immutableArray([]) })
		case 'and':
			return immutableRecord({
				AND: immutableArray(
					expression.expressions.map(serializeWhereExpression),
				),
			})
		case 'or':
			return immutableRecord({
				OR: immutableArray(
					expression.expressions.map(serializeWhereExpression),
				),
			})
		case 'not':
			return immutableRecord({
				NOT: serializeWhereExpression(expression.expression),
			})
		default:
			return serializeWhereLeaf(
				expression as unknown as
					SerializableWherePrimitive | QueryRelationFilterNode,
			)
	}
}

/** Restores the canonical object filter represented by one normalized AST node. */
export const whereInputFromQueryFilter = <
	const TSchema extends SchemaDefinition,
>(
	expression: QueryFilterNode<TSchema>,
): WhereInput<TSchema> => serializeWhereExpression(expression)

const resolveWhereBuilderInput = <TSchema extends SchemaDefinition>(
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

	whereBuilderStates.set(builder, immutableRecord({ expression, schema }))
	Object.freeze(builder)

	return builder
}

const createWhereTargetInput = <TSchema extends SchemaDefinition>(
	target: unknown,
	operator: string,
	operand: unknown,
): WhereInput<TSchema> => {
	if (typeof target === 'string') {
		return immutableRecord({
			[target]: immutableRecord({ [operator]: operand }),
		})
	}

	if (
		!isPlainRecord(target) ||
		target.kind !== 'field-path' ||
		typeof target.field !== 'string' ||
		!isUnknownArray(target.path)
	) {
		throw new TypeError('WhereBuilder target must be a field or field path')
	}

	return immutableRecord({
		[target.field]: immutableRecord({
			at: immutableArray([
				immutableRecord({ path: target.path, [operator]: operand }),
			]),
		}),
	})
}

/** Builds schema-correlated where objects without becoming a second AST source. */
export class WhereBuilder<TSchema extends SchemaDefinition> {
	constructor(schema: TSchema) {
		if (!Schema.is(schema)) {
			throw new TypeError('WhereBuilder schema must be a schema definition')
		}

		whereBuilderStates.set(
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
		const inputObject = immutableRecord({
			[fieldName]: immutableRecord({
				[operator]: serializeWhereExpression(nested),
			}),
		}) as unknown as WhereInput<TSchema>

		return this.#append(inputObject)
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
		const inputObject = immutableRecord({
			[fieldName]: immutableRecord({
				[operator === 'is-not' ? 'isNot' : 'is']:
					serializeWhereExpression(nested),
			}),
		}) as unknown as WhereInput<TSchema>

		return this.#append(inputObject)
	}
}

/** Resolves every supported public where form through the same object normalizer. */
export const resolveWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereSource<TSchema>,
): QueryFilterNode<TSchema> => resolveWhereBuilderInput(schema, input)
