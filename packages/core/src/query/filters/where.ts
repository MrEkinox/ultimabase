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
import type { GeneratedSchemaValueOr } from '../../schema/generated-contracts.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryFieldName } from '../ast/contracts.js'
import type { OperationObjectId } from '../operations/contracts.js'
import { parseQueryFieldName } from '../ast/schema.js'
import {
	createQueryJsonPathFilter,
	createQueryKeyFilter,
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
	type QueryRelationPredicateOperator,
	type QueryRelationQuantifierOperator,
	type QueryRelationshipPredicateNode,
} from './relation.js'
import type {
	QueryComparisonFilterNode,
	QueryEqualityFilterNode,
	QueryFieldPath,
	QueryFilterFieldName,
	QueryFilterOperand,
	QueryFilterTarget,
	QueryFilterValue,
	QueryJsonPathExpression,
	QueryJsonPathFilterNode,
	QueryKeyFilterNode,
	QueryKeysFilterNode,
	QueryMembershipFilterNode,
	QueryNullFilterNode,
	QueryPrimitiveFilterNode,
	QueryRangeFilterNode,
	QueryRegexFilterNode,
	QueryRegexPattern,
	QueryStringFilterNode,
	QueryStructuralContainmentFilterNode,
} from './primitive.js'

/** Reserves transport-friendly logical names outside schema field space. */
export const whereLogicalKeys = ['AND', 'OR', 'NOT'] as const

export type WhereLogicalKey = (typeof whereLogicalKeys)[number]

type Simplify<TValue> = { readonly [TKey in keyof TValue]: TValue[TKey] } & {}

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type WhereIdentityOperand<TValue> = [Extract<TValue, Pointer>] extends [never]
	? TValue
	: Extract<TValue, Pointer> extends Pointer<infer TTarget>
		? OperationObjectId<TTarget>
		: TValue

type WhereOperatorsForNode<TNode> =
	TNode extends QueryEqualityFilterNode<
		string,
		infer TValue,
		readonly string[] | undefined
	>
		? Readonly<{
				eq?: WhereIdentityOperand<TValue>
				ne?: WhereIdentityOperand<TValue>
			}>
		: TNode extends QueryComparisonFilterNode<string, infer TValue>
			? Readonly<{
					gt?: TValue
					gte?: TValue
					lt?: TValue
					lte?: TValue
				}>
			: TNode extends QueryRangeFilterNode<string, infer TValue>
				? Readonly<{
						between?: Readonly<{ lower: TValue; upper: TValue }>
						notBetween?: Readonly<{ lower: TValue; upper: TValue }>
					}>
				: TNode extends QueryMembershipFilterNode<
							string,
							infer TValue,
							readonly string[] | undefined
					  >
					? Readonly<{
							in?: readonly WhereIdentityOperand<TValue>[]
							notIn?: readonly WhereIdentityOperand<TValue>[]
						}>
					: TNode extends QueryStringFilterNode<
								string,
								infer TValue,
								readonly string[] | undefined
						  >
						? Readonly<{
								contains?: TValue
								endsWith?: TValue
								startsWith?: TValue
							}>
						: TNode extends QueryStructuralContainmentFilterNode<
									string,
									infer TValue,
									readonly string[] | undefined
							  >
							? Readonly<{
									containedBy?: TValue
									contains?: TValue
								}>
							: TNode extends QueryKeyFilterNode<
										string,
										infer TKey,
										readonly string[] | undefined
								  >
								? Readonly<{ hasKey?: TKey }>
								: TNode extends QueryKeysFilterNode<
											string,
											infer TKey,
											readonly string[] | undefined
									  >
									? Readonly<{
											hasAllKeys?: readonly TKey[]
											hasAnyKeys?: readonly TKey[]
										}>
									: TNode extends QueryJsonPathFilterNode<
												string,
												readonly string[] | undefined
										  >
										? Readonly<{
												jsonPathExists?: QueryJsonPathExpression
												jsonPathMatches?: QueryJsonPathExpression
											}>
										: TNode extends QueryRegexFilterNode
											? Readonly<{ matches?: QueryRegexPattern }>
											: TNode extends QueryNullFilterNode<
														string,
														readonly string[] | undefined
												  >
												? Readonly<{
														isNotNull?: true
														isNull?: true
													}>
												: unknown

type RootPrimitiveNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> =
	QueryPrimitiveFilterNode<TSchema, TFieldName> extends infer TNode
		? TNode extends { readonly path: readonly string[] }
			? never
			: TNode
		: never

type PathPrimitiveNode<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<
	QueryPrimitiveFilterNode<TSchema, TFieldName>,
	{ readonly path: readonly [string, ...string[]] }
>

type NodesAtPath<TNode, TPath extends readonly string[]> = TNode extends {
	readonly path: infer TNodePath extends readonly string[]
}
	? TNodePath extends TPath
		? TPath extends TNodePath
			? TNode
			: never
		: never
	: never

type WherePathCondition<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
	TNode = PathPrimitiveNode<TSchema, TFieldName>,
> = TNode extends { readonly path: infer TPath extends readonly string[] }
	? Simplify<
			Readonly<{ path: TPath }> &
				UnionToIntersection<WhereOperatorsForNode<NodesAtPath<TNode, TPath>>>
		>
	: never

type WhereRelationCountInput<
	TSchema extends SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSchema>,
	TDepth extends readonly unknown[],
> = QueryRelationCountInput &
	(TDepth['length'] extends typeof queryRelationPredicateMaxDepth
		? Readonly<{ where?: never }>
		: Readonly<{
				/** Filters visible relation targets before evaluating the cardinality comparisons. */
				where?: WhereInputAtDepth<
					SchemaRelationTarget<TSchema, TFieldName>,
					readonly [...TDepth, unknown]
				>
			}>)

type WhereRelationOperators<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
	TDepth extends readonly unknown[],
> =
	TFieldName extends SchemaRelationFieldName<TSchema>
		? Readonly<{
				count?: WhereRelationCountInput<TSchema, TFieldName, TDepth>
				isEmpty?: true
				isNotEmpty?: true
			}> &
				(TDepth['length'] extends typeof queryRelationPredicateMaxDepth
					? unknown
					: Readonly<{
							every?: WhereInputAtDepth<
								SchemaRelationTarget<TSchema, TFieldName>,
								readonly [...TDepth, unknown]
							>
							none?: WhereInputAtDepth<
								SchemaRelationTarget<TSchema, TFieldName>,
								readonly [...TDepth, unknown]
							>
							some?: WhereInputAtDepth<
								SchemaRelationTarget<TSchema, TFieldName>,
								readonly [...TDepth, unknown]
							>
						}>)
		: unknown

type WherePointerOperators<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
	TDepth extends readonly unknown[],
> =
	TFieldName extends SchemaPointerFieldName<TSchema>
		? TDepth['length'] extends typeof queryRelationPredicateMaxDepth
			? unknown
			: Readonly<{
					is?: WhereInputAtDepth<
						SchemaPointerTarget<TSchema, TFieldName>,
						readonly [...TDepth, unknown]
					>
					isNot?: WhereInputAtDepth<
						SchemaPointerTarget<TSchema, TFieldName>,
						readonly [...TDepth, unknown]
					>
				}>
		: unknown

type WhereFieldInput<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
	TDepth extends readonly unknown[],
> = Simplify<
	UnionToIntersection<
		WhereOperatorsForNode<RootPrimitiveNode<TSchema, TFieldName>>
	> &
		([PathPrimitiveNode<TSchema, TFieldName>] extends [never]
			? unknown
			: Readonly<{
					at?: readonly WherePathCondition<TSchema, TFieldName>[]
				}>) &
		WhereRelationOperators<TSchema, TFieldName, TDepth> &
		WherePointerOperators<TSchema, TFieldName, TDepth>
>

type WhereInputAtDepth<
	TSchema extends SchemaDefinition,
	TDepth extends readonly unknown[],
> = Readonly<
	{
		readonly [TFieldName in QueryFieldName<TSchema>]?: WhereFieldInput<
			TSchema,
			TFieldName,
			TDepth
		>
	} & {
		readonly AND?: readonly WhereInputAtDepth<TSchema, TDepth>[]
		readonly NOT?: WhereInputAtDepth<TSchema, TDepth>
		readonly OR?: readonly WhereInputAtDepth<TSchema, TDepth>[]
	}
>

/** Describes one schema-correlated, transport-neutral filter object. */
export type WhereInput<TSchema extends SchemaDefinition> =
	GeneratedSchemaValueOr<
		TSchema,
		'Where',
		WhereInputAtDepth<TSchema, readonly []>
	>

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

type WhereComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type WhereBuilderOperand<
	TSchema extends SchemaDefinition,
	TOperator extends 'equal' | 'in' | 'not-equal' | 'not-in',
	TTarget extends QueryFilterTarget<TSchema, TOperator>,
> = WhereIdentityOperand<QueryFilterOperand<TSchema, TOperator, TTarget>>

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
): QueryRelationshipPredicateNode => {
	if (relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	const field = schema.fields[fieldName]
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

	const field = schema.fields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	if (field?.kind !== 'relation' || !Schema.is(target)) {
		throw new TypeError(`where.${fieldName}.count requires a relation field`)
	}
	const relationFieldName =
		fieldName as unknown as SchemaRelationFieldName<TSchema>
	const exactTarget = target as unknown as SchemaRelationTarget<
		TSchema,
		typeof relationFieldName
	>

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

	const expression = hasWhere
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
	if (typeof target !== 'string' || schema.fields[target]?.kind !== 'pointer') {
		return operand
	}

	const targetSchema = getFieldSchemaTarget(schema.fields[target])?.()

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
		if (operator === 'isEmpty' || operator === 'isNotEmpty') {
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
				) as QueryFilterNode<TSchema>,
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
				) as QueryFilterNode<TSchema>,
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
	} else if (expression.kind === 'in' || expression.kind === 'not-in') {
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
	} else if (expression.kind === 'null') {
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
): WhereInput<TSchema> =>
	serializeWhereExpression(expression) as unknown as WhereInput<TSchema>

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
		}) as unknown as WhereInput<TSchema>
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
	}) as unknown as WhereInput<TSchema>
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
	count<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereRelationCountInput<TSchema, TFieldName, readonly []>,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ count: input }),
			}) as unknown as WhereInput<TSchema>,
		)
	}

	/**
	 * Requires one relation to contain no visible target.
	 * @example `where.isEmpty('comments')`
	 */
	isEmpty(fieldName: SchemaRelationFieldName<TSchema>): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ isEmpty: true }),
			}) as unknown as WhereInput<TSchema>,
		)
	}

	/**
	 * Requires one relation to contain at least one visible target.
	 * @example `where.isNotEmpty('comments')`
	 */
	isNotEmpty(
		fieldName: SchemaRelationFieldName<TSchema>,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ isNotEmpty: true }),
			}) as unknown as WhereInput<TSchema>,
		)
	}

	/**
	 * Compares one field or structured path for equality.
	 * @example `where.eq('published', true)`
	 */
	eq<TTarget extends QueryFilterTarget<TSchema, 'equal'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'eq', value))
	}

	/**
	 * Compares one field or structured path for inequality.
	 * @example `where.ne('status', 'archived')`
	 */
	ne<TTarget extends QueryFilterTarget<TSchema, 'not-equal'>>(
		target: TTarget,
		value: WhereBuilderOperand<TSchema, 'not-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'ne', value))
	}

	/**
	 * Adds one strict lower bound.
	 * @example `where.gt('views', 0)`
	 */
	gt<TTarget extends QueryFilterTarget<TSchema, 'greater-than'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'greater-than', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gt', value))
	}

	/**
	 * Adds one inclusive lower bound.
	 * @example `where.gte('views', 0)`
	 */
	gte<TTarget extends QueryFilterTarget<TSchema, 'greater-than-or-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'greater-than-or-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gte', value))
	}

	/**
	 * Adds one strict upper bound.
	 * @example `where.lt('views', 100)`
	 */
	lt<TTarget extends QueryFilterTarget<TSchema, 'less-than'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'less-than', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lt', value))
	}

	/**
	 * Adds one inclusive upper bound.
	 * @example `where.lte('views', 100)`
	 */
	lte<TTarget extends QueryFilterTarget<TSchema, 'less-than-or-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'less-than-or-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lte', value))
	}

	/**
	 * Requires one inclusive interval.
	 * @example `where.between('views', 10, 100)`
	 */
	between<TFieldName extends QueryFilterFieldName<TSchema, 'between'>>(
		target: TFieldName,
		lower: WhereComparisonValue<TSchema, TFieldName>,
		upper: WhereComparisonValue<TSchema, TFieldName>,
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
	notBetween<TFieldName extends QueryFilterFieldName<TSchema, 'not-between'>>(
		target: TFieldName,
		lower: WhereComparisonValue<TSchema, TFieldName>,
		upper: WhereComparisonValue<TSchema, TFieldName>,
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
	in<TTarget extends QueryFilterTarget<TSchema, 'in'>>(
		target: TTarget,
		values: readonly WhereBuilderOperand<TSchema, 'in', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'in', values))
	}

	/**
	 * Excludes membership in one immutable candidate list.
	 * @example `where.notIn('status', ['archived'])`
	 */
	notIn<TTarget extends QueryFilterTarget<TSchema, 'not-in'>>(
		target: TTarget,
		values: readonly WhereBuilderOperand<TSchema, 'not-in', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'notIn', values))
	}

	/**
	 * Adds string or structural containment.
	 * @example `where.contains('title', 'Ultima')`
	 */
	contains<TTarget extends QueryFilterTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contains', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'contains', value))
	}

	/**
	 * Requires one structured target to be contained by the operand.
	 * @example `where.containedBy('metadata', { public: true })`
	 */
	containedBy<TTarget extends QueryFilterTarget<TSchema, 'contained-by'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contained-by', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'containedBy', value))
	}

	/**
	 * Adds one prefix match.
	 * @example `where.startsWith('title', 'Ultima')`
	 */
	startsWith<TTarget extends QueryFilterTarget<TSchema, 'starts-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'starts-with', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'startsWith', value))
	}

	/**
	 * Adds one suffix match.
	 * @example `where.endsWith('title', 'Base')`
	 */
	endsWith<TTarget extends QueryFilterTarget<TSchema, 'ends-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'ends-with', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'endsWith', value))
	}

	/**
	 * Tests one structured key.
	 * @example `where.hasKey('metadata', 'published')`
	 */
	hasKey<TTarget extends QueryFilterTarget<TSchema, 'has-key'>>(
		target: TTarget,
		key: QueryFilterOperand<TSchema, 'has-key', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasKey', key))
	}

	/**
	 * Tests whether any structured key exists.
	 * @example `where.hasAnyKeys('metadata', ['draft', 'published'])`
	 */
	hasAnyKeys<TTarget extends QueryFilterTarget<TSchema, 'has-any-keys'>>(
		target: TTarget,
		keys: readonly QueryFilterOperand<TSchema, 'has-any-keys', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAnyKeys', keys))
	}

	/**
	 * Tests whether every structured key exists.
	 * @example `where.hasAllKeys('metadata', ['title', 'slug'])`
	 */
	hasAllKeys<TTarget extends QueryFilterTarget<TSchema, 'has-all-keys'>>(
		target: TTarget,
		keys: readonly QueryFilterOperand<TSchema, 'has-all-keys', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAllKeys', keys))
	}

	/**
	 * Tests whether one JSONPath expression returns an item.
	 * @example `where.jsonPathExists('metadata', { source: '$.items[*]' })`
	 */
	jsonPathExists(
		target: QueryFilterTarget<TSchema, 'json-path-exists'>,
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
		target: QueryFilterTarget<TSchema, 'json-path-matches'>,
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
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(fieldName, 'matches', pattern))
	}

	/**
	 * Requires one field or structured path to contain null.
	 * @example `where.isNull('deletedAt')`
	 */
	isNull(target: QueryFilterTarget<TSchema, 'null'>): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'isNull', true))
	}

	/**
	 * Requires one field or structured path to contain a non-null value.
	 * @example `where.isNotNull('publishedAt')`
	 */
	isNotNull(target: QueryFilterTarget<TSchema, 'null'>): WhereBuilder<TSchema> {
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
		const field = state.schema.fields[fieldName]
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
		const field = state.schema.fields[fieldName]
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
