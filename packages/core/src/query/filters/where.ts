import {
	Schema,
	type SchemaDefinition,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryFieldName } from '../ast/contracts.js'
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
	type QueryRelationCountOperator,
	type QueryRelationFilterNode,
	type QueryRelationPredicateNode,
	type QueryRelationPredicateOperator,
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

type WhereOperatorsForNode<TNode> =
	TNode extends QueryEqualityFilterNode<
		string,
		infer TValue,
		readonly string[] | undefined
	>
		? Readonly<{ eq?: TValue; ne?: TValue }>
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
							in?: readonly TValue[]
							notIn?: readonly TValue[]
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

type WhereRelationOperators<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
	TDepth extends readonly unknown[],
> =
	TFieldName extends SchemaRelationFieldName<TSchema>
		? Readonly<{ count?: QueryRelationCountInput }> &
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
		WhereRelationOperators<TSchema, TFieldName, TDepth>
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
export type WhereInput<TSchema extends SchemaDefinition> = WhereInputAtDepth<
	TSchema,
	readonly []
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

const normalizeWhereRelation = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	operator: QueryRelationPredicateOperator,
	input: unknown,
	relationDepth: number,
	ancestors: WeakSet<object>,
): QueryRelationPredicateNode => {
	if (relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	const field = schema.fields[fieldName]
	const target =
		field === undefined ? undefined : getFieldSchemaTarget(field)?.()

	if (field?.kind !== 'relation' || !Schema.is(target)) {
		throw new TypeError(
			`where.${fieldName}.${operator} requires a relation field`,
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

const normalizeWhereRelationCount = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`where.${fieldName}.count must be an object`)
	}

	let expression: QueryFilterNode<TSchema> | undefined

	for (const [operator, operand] of Object.entries(input)) {
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

		expression = combineWhereExpressions(
			expression,
			createQueryRelationCount(
				schema,
				fieldName as unknown as SchemaRelationFieldName<TSchema>,
				relationCountOperator(operator),
				operand as
					| number
					| readonly number[]
					| Readonly<{ lower: number; upper: number }>,
			) as QueryFilterNode<TSchema>,
		)
	}

	if (expression === undefined) {
		throw new TypeError(`where.${fieldName}.count must contain an operator`)
	}

	return expression
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

const normalizeWhereOperator = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: QueryFieldName<TSchema> | QueryFieldPath,
	operator: string,
	operand: unknown,
	path: string,
): QueryFilterNode<TSchema> => {
	switch (operator) {
		case 'eq':
			return createQueryValueFilter(schema, 'equal', target, operand)
		case 'ne':
			return createQueryValueFilter(schema, 'not-equal', target, operand)
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
				operand,
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
		if (operator === 'count') {
			expression = combineWhereExpressions(
				expression,
				normalizeWhereRelationCount(schema, fieldName, operand),
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

		if (operator === 'some' || operator === 'none' || operator === 'every') {
			expression = combineWhereExpressions(
				expression,
				normalizeWhereRelation(
					schema,
					fieldName,
					operator,
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
		const operator = shortOperatorForKind(expression.operator)
		let operand: unknown

		if (
			expression.operator === 'between' ||
			expression.operator === 'not-between'
		) {
			operand = immutableRecord({
				lower: expression.lower,
				upper: expression.upper,
			})
		} else if (
			expression.operator === 'in' ||
			expression.operator === 'not-in'
		) {
			operand = expression.values
		} else if ('value' in expression) {
			operand = expression.value
		} else {
			throw new TypeError('Unsupported relation count operator')
		}

		return immutableRecord({
			[expression.field]: immutableRecord({
				count: immutableRecord({ [operator]: operand }),
			}),
		})
	}

	if (isQueryRelationPredicateNode(expression)) {
		return immutableRecord({
			[expression.field]: immutableRecord({
				[expression.operator]: serializeWhereExpression(expression.expression),
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
		operand = expression.values
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
		operand = expression.value
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

	/** Compares the visible cardinality of one relation. */
	count(
		fieldName: SchemaRelationFieldName<TSchema>,
		input: QueryRelationCountInput,
	): WhereBuilder<TSchema> {
		return this.#append(
			immutableRecord({
				[fieldName]: immutableRecord({ count: input }),
			}) as unknown as WhereInput<TSchema>,
		)
	}

	/** Compares one field or structured path for equality. */
	eq<TTarget extends QueryFilterTarget<TSchema, 'equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'eq', value))
	}

	/** Compares one field or structured path for inequality. */
	ne<TTarget extends QueryFilterTarget<TSchema, 'not-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'not-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'ne', value))
	}

	/** Adds one strict lower bound. */
	gt<TTarget extends QueryFilterTarget<TSchema, 'greater-than'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'greater-than', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gt', value))
	}

	/** Adds one inclusive lower bound. */
	gte<TTarget extends QueryFilterTarget<TSchema, 'greater-than-or-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'greater-than-or-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'gte', value))
	}

	/** Adds one strict upper bound. */
	lt<TTarget extends QueryFilterTarget<TSchema, 'less-than'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'less-than', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lt', value))
	}

	/** Adds one inclusive upper bound. */
	lte<TTarget extends QueryFilterTarget<TSchema, 'less-than-or-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'less-than-or-equal', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'lte', value))
	}

	/** Requires one inclusive interval. */
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

	/** Requires the inverse of one inclusive interval. */
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

	/** Requires membership in one immutable candidate list. */
	in<TTarget extends QueryFilterTarget<TSchema, 'in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'in', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'in', values))
	}

	/** Excludes membership in one immutable candidate list. */
	notIn<TTarget extends QueryFilterTarget<TSchema, 'not-in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'not-in', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'notIn', values))
	}

	/** Adds string or structural containment. */
	contains<TTarget extends QueryFilterTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contains', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'contains', value))
	}

	/** Requires one structured target to be contained by the operand. */
	containedBy<TTarget extends QueryFilterTarget<TSchema, 'contained-by'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contained-by', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'containedBy', value))
	}

	/** Adds one prefix match. */
	startsWith<TTarget extends QueryFilterTarget<TSchema, 'starts-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'starts-with', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'startsWith', value))
	}

	/** Adds one suffix match. */
	endsWith<TTarget extends QueryFilterTarget<TSchema, 'ends-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'ends-with', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'endsWith', value))
	}

	/** Tests one structured key. */
	hasKey<TTarget extends QueryFilterTarget<TSchema, 'has-key'>>(
		target: TTarget,
		key: QueryFilterOperand<TSchema, 'has-key', TTarget>,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasKey', key))
	}

	/** Tests whether any structured key exists. */
	hasAnyKeys<TTarget extends QueryFilterTarget<TSchema, 'has-any-keys'>>(
		target: TTarget,
		keys: readonly QueryFilterOperand<TSchema, 'has-any-keys', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAnyKeys', keys))
	}

	/** Tests whether every structured key exists. */
	hasAllKeys<TTarget extends QueryFilterTarget<TSchema, 'has-all-keys'>>(
		target: TTarget,
		keys: readonly QueryFilterOperand<TSchema, 'has-all-keys', TTarget>[],
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'hasAllKeys', keys))
	}

	/** Tests whether one JSONPath expression returns an item. */
	jsonPathExists(
		target: QueryFilterTarget<TSchema, 'json-path-exists'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#append(
			createWhereTargetInput(target, 'jsonPathExists', expression),
		)
	}

	/** Tests one JSONPath boolean expression. */
	jsonPathMatches(
		target: QueryFilterTarget<TSchema, 'json-path-matches'>,
		expression: QueryJsonPathExpression,
	): WhereBuilder<TSchema> {
		return this.#append(
			createWhereTargetInput(target, 'jsonPathMatches', expression),
		)
	}

	/** Adds one declarative regular expression. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(fieldName, 'matches', pattern))
	}

	/** Requires one field or structured path to contain null. */
	isNull(target: QueryFilterTarget<TSchema, 'null'>): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'isNull', true))
	}

	/** Requires one field or structured path to contain a non-null value. */
	isNotNull(target: QueryFilterTarget<TSchema, 'null'>): WhereBuilder<TSchema> {
		return this.#append(createWhereTargetInput(target, 'isNotNull', true))
	}

	/** Combines another filter through AND. */
	and(input: WhereSource<TSchema>): WhereBuilder<TSchema> {
		return this.#combine(input, 'and', false)
	}

	/** Combines another filter through OR. */
	or(input: WhereSource<TSchema>): WhereBuilder<TSchema> {
		return this.#combine(input, 'or', false)
	}

	/** Negates another filter before combining it through AND. */
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

	/** Requires no related target to match. */
	none<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relation('none', fieldName, input)
	}

	/** Requires every related target to match. */
	every<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		input: WhereSource<SchemaRelationTarget<TSchema, TFieldName>>,
	): WhereBuilder<TSchema> {
		return this.#relation('every', fieldName, input)
	}

	/** Returns the immutable object contract shared by direct and transport filters. */
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
		operator: QueryRelationPredicateOperator,
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
}

/** Resolves every supported public where form through the same object normalizer. */
export const resolveWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereSource<TSchema>,
): QueryFilterNode<TSchema> => resolveWhereBuilderInput(schema, input)
