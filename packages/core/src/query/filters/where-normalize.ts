import {
	getFieldSchemaTarget,
	Pointer,
	Schema,
	type SchemaDefinition,
	type SchemaRelationFieldName,
} from '../../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import { parsePersistedQueryFieldName } from '../ast/schema.js'
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
} from './factory.js'
import { fieldPath } from './target.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import {
	readWhereOperatorKind,
	type QueryFieldPath,
	type QueryJsonPathExpression,
	type QueryRegexPattern,
} from './primitive.js'
import {
	createQueryRelationCount,
	createQueryRelationDepthError,
	queryRelationPredicateMaxDepth,
	relationCountOperators,
	resolveRelationshipTarget,
	type QueryRelationPredicateOperator,
} from './relation.js'
import type { WhereInput } from './where-contracts.js'

type WhereTarget<TSchema extends SchemaDefinition> =
	QueryFieldName<TSchema> | QueryFieldPath

/** Carries recursion state through one `where` object and its relationships. */
interface WhereContext<TSchema extends SchemaDefinition> {
	readonly schema: TSchema
	readonly relationDepth: number
	readonly ancestors: WeakSet<object>
}

export const combineWhereExpressions = <TSchema extends SchemaDefinition>(
	left: QueryFilterNode<TSchema> | undefined,
	right: QueryFilterNode<TSchema>,
	kind: 'and' | 'or' = 'and',
): QueryFilterNode<TSchema> =>
	left === undefined
		? right
		: normalizeLogicalFilter({ kind, expressions: [left, right] })

export const createConstantWhereExpression = <TSchema extends SchemaDefinition>(
	value: boolean,
): QueryFilterNode<TSchema> => immutableRecord({ kind: 'constant', value })

const assertEnabledWhereFlag = (input: unknown, path: string): void => {
	if (input !== true) {
		throw new TypeError(`${path} must be true`)
	}
}

const assertWhereArray: (
	input: unknown,
	path: string,
) => asserts input is readonly unknown[] = (input, path) => {
	if (!isUnknownArray(input)) {
		throw new TypeError(`${path} must be an array`)
	}
}

const assertRootWhereTarget: <TSchema extends SchemaDefinition>(
	target: WhereTarget<TSchema>,
	path: string,
) => asserts target is QueryFieldName<TSchema> = (target, path) => {
	if (typeof target !== 'string') {
		throw new TypeError(`${path} does not support field paths`)
	}
}

/** Pointer identity operands are target object IDs and become exact Pointers. */
const normalizePointerIdentityOperand = (
	schema: SchemaDefinition,
	target: WhereTarget<SchemaDefinition>,
	operand: unknown,
	path: string,
): unknown => {
	const pointer =
		typeof target === 'string' ? schema.persistedFields[target] : undefined

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

/** Converts one canonical operator entry into its portable primitive leaf. */
const normalizeWhereOperator = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	target: WhereTarget<TSchema>,
	operator: string,
	operand: unknown,
	path: string,
): QueryFilterNode<TSchema> => {
	if (operator === 'isNull' || operator === 'isNotNull') {
		assertEnabledWhereFlag(operand, path)
		return createQueryNullFilter(schema, target, operator === 'isNull')
	}

	const kind = readWhereOperatorKind(operator)

	switch (kind) {
		case 'equal':
		case 'not-equal':
			return createQueryValueFilter(
				schema,
				kind,
				target,
				normalizePointerIdentityOperand(schema, target, operand, path),
			)
		case 'greater-than':
		case 'greater-than-or-equal':
		case 'less-than':
		case 'less-than-or-equal':
		case 'starts-with':
		case 'ends-with':
			return createQueryValueFilter(schema, kind, target, operand)
		case 'between':
		case 'not-between': {
			assertRootWhereTarget(target, path)

			if (!isPlainRecord(operand)) {
				throw new TypeError(`${path} must be an object`)
			}

			if (
				Object.keys(operand).length !== 2 ||
				!Object.hasOwn(operand, 'lower') ||
				!Object.hasOwn(operand, 'upper')
			) {
				throw new TypeError(`${path} must contain only lower and upper`)
			}

			return createQueryRangeFilter(
				schema,
				kind,
				target,
				operand.lower,
				operand.upper,
			)
		}
		case 'in':
		case 'not-in':
			assertWhereArray(operand, path)
			return createQueryMembershipFilter(
				schema,
				kind,
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
		case 'list-has':
			return createQueryListFilter(schema, kind, target, operand)
		case 'list-has-some':
		case 'list-has-every':
			assertWhereArray(operand, path)
			return createQueryListFilter(schema, kind, target, operand)
		case 'list-empty':
			assertEnabledWhereFlag(operand, path)
			return createQueryListFilter(schema, kind, target)
		case 'contains':
		case 'contained-by':
			return createQueryStructuralFilter(schema, kind, target, operand)
		case 'has-key':
		case 'has-any-keys':
		case 'has-all-keys':
			// The factory validates the untrusted key operand shape.
			return createQueryKeyFilter(
				schema,
				kind,
				target,
				operand as string | readonly string[],
			)
		case 'json-path-exists':
		case 'json-path-matches':
			return createQueryJsonPathFilter(
				schema,
				kind,
				target,
				operand as QueryJsonPathExpression,
			)
		case 'regex':
			assertRootWhereTarget(target, path)
			return createQueryRegexFilter(
				schema,
				target,
				operand as QueryRegexPattern,
			)
		default:
			throw new TypeError(`${path} is not a supported where operator`)
	}
}

const nestedContext = <TTarget extends SchemaDefinition>(
	context: WhereContext<SchemaDefinition>,
	target: TTarget,
): WhereContext<TTarget> => ({
	schema: target,
	relationDepth: context.relationDepth + 1,
	ancestors: context.ancestors,
})

const normalizeWhereRelationship = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	fieldName: QueryFieldName<TSchema>,
	operator: QueryRelationPredicateOperator,
	input: unknown,
): QueryFilterNode<TSchema> => {
	if (context.relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	const expectedKind =
		operator === 'is' || operator === 'is-not' ? 'pointer' : 'relation'
	const target = resolveRelationshipTarget(
		context.schema,
		fieldName,
		expectedKind,
	)

	if (target === undefined) {
		throw new TypeError(
			`where.${fieldName}.${operator} requires a ${expectedKind} field`,
		)
	}

	const expression = normalizeWhereRecord(nestedContext(context, target), input)

	// Relation leaves are schema-correlated only through their runtime field and
	// target nodes, which this function derives from the same declaration.
	return immutableRecord({
		kind: 'relation-predicate',
		operator,
		field: fieldName,
		source: createQueryAst(context.schema).schema,
		target: createQueryAst(target).schema,
		expression,
	}) as unknown as QueryFilterNode<TSchema>
}

const normalizeWhereRelationCount = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
): QueryFilterNode<TSchema> => {
	const path = `where.${fieldName}.count`

	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	const target = resolveRelationshipTarget(
		context.schema,
		fieldName,
		'relation',
	)

	if (target === undefined) {
		throw new TypeError(`${path} requires a relation field`)
	}

	const { where, ...comparisons } = input

	for (const operator of Object.keys(comparisons)) {
		if (!relationCountOperators.has(operator)) {
			throw new TypeError(
				`${path}.${operator} is not a supported where operator`,
			)
		}
	}

	if (Object.keys(comparisons).length === 0) {
		throw new TypeError(`${path} must contain an operator`)
	}

	const hasWhere = Object.hasOwn(input, 'where')

	if (hasWhere && context.relationDepth >= queryRelationPredicateMaxDepth) {
		throw createQueryRelationDepthError()
	}

	// The relation field and its target were resolved together above; the
	// conversion only restores that correlation for the schema-typed tree.
	return createQueryRelationCount(
		context.schema,
		fieldName as unknown as SchemaRelationFieldName<TSchema>,
		immutableRecord(comparisons),
		hasWhere
			? normalizeWhereRecord(nestedContext(context, target), where)
			: createConstantWhereExpression(true),
	) as unknown as QueryFilterNode<TSchema>
}

const normalizeWherePaths = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
): QueryFilterNode<TSchema> | undefined => {
	assertWhereArray(input, `where.${fieldName}.at`)

	let expression: QueryFilterNode<TSchema> | undefined

	for (const [index, pathInput] of input.entries()) {
		const path = `where.${fieldName}.at[${String(index)}]`

		if (!isPlainRecord(pathInput) || !Object.hasOwn(pathInput, 'path')) {
			throw new TypeError(`${path} must contain path`)
		}

		const { path: segments, ...operators } = pathInput

		if (
			!isUnknownArray(segments) ||
			segments.length === 0 ||
			!segments.every((segment) => typeof segment === 'string')
		) {
			throw new TypeError(`${path}.path must be a non-empty string array`)
		}

		const target = fieldPath(fieldName, segments as [string, ...string[]])
		let pathExpression: QueryFilterNode<TSchema> | undefined

		for (const [operator, operand] of Object.entries(operators)) {
			pathExpression = combineWhereExpressions(
				pathExpression,
				normalizeWhereOperator(
					schema,
					target,
					operator,
					operand,
					`${path}.${operator}`,
				),
			)
		}

		if (pathExpression === undefined) {
			throw new TypeError(`${path} must contain an operator`)
		}

		expression = combineWhereExpressions(expression, pathExpression)
	}

	return expression
}

const relationshipOperators: Readonly<
	Record<string, QueryRelationPredicateOperator>
> = {
	every: 'every',
	is: 'is',
	isNot: 'is-not',
	none: 'none',
	some: 'some',
}

const normalizeWhereFieldOperator = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	fieldName: QueryFieldName<TSchema>,
	operator: string,
	operand: unknown,
): QueryFilterNode<TSchema> | undefined => {
	const isRelation =
		context.schema.persistedFields[fieldName]?.kind === 'relation'

	if (isRelation && (operator === 'isEmpty' || operator === 'isNotEmpty')) {
		// Relation emptiness keeps the adapters' optimized existence predicates.
		assertEnabledWhereFlag(operand, `where.${fieldName}.${operator}`)
		return normalizeWhereRelationship(
			context,
			fieldName,
			operator === 'isEmpty' ? 'none' : 'some',
			immutableRecord({}),
		)
	}

	if (operator === 'count') {
		return normalizeWhereRelationCount(context, fieldName, operand)
	}

	if (operator === 'at') {
		return normalizeWherePaths(context.schema, fieldName, operand)
	}

	const relationshipOperator = Object.hasOwn(relationshipOperators, operator)
		? relationshipOperators[operator]
		: undefined

	return relationshipOperator === undefined
		? normalizeWhereOperator(
				context.schema,
				fieldName,
				operator,
				operand,
				`where.${fieldName}.${operator}`,
			)
		: normalizeWhereRelationship(
				context,
				fieldName,
				relationshipOperator,
				operand,
			)
}

const normalizeWhereField = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	fieldName: QueryFieldName<TSchema>,
	input: unknown,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`where.${fieldName} must be an object`)
	}

	let expression: QueryFilterNode<TSchema> | undefined

	for (const [operator, operand] of Object.entries(input)) {
		const next = normalizeWhereFieldOperator(
			context,
			fieldName,
			operator,
			operand,
		)
		expression =
			next === undefined
				? expression
				: combineWhereExpressions(expression, next)
	}

	if (expression === undefined) {
		throw new TypeError(`where.${fieldName} must contain an operator`)
	}

	return expression
}

const normalizeWhereEntry = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	key: string,
	value: unknown,
): QueryFilterNode<TSchema> => {
	switch (key) {
		case 'AND':
		case 'OR':
			assertWhereArray(value, `where.${key}`)
			return normalizeLogicalFilter({
				kind: key === 'AND' ? 'and' : 'or',
				expressions: value.map((item) => normalizeWhereRecord(context, item)),
			})
		case 'NOT':
			return normalizeLogicalFilter({
				kind: 'not',
				expression: normalizeWhereRecord(context, value),
			})
		default:
			return normalizeWhereField(
				context,
				parsePersistedQueryFieldName(context.schema, key, `where.${key}`),
				value,
			)
	}
}

const normalizeWhereRecord = <TSchema extends SchemaDefinition>(
	context: WhereContext<TSchema>,
	input: unknown,
): QueryFilterNode<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError('where must be an object')
	}

	if (context.ancestors.has(input)) {
		throw new TypeError('where must not contain circular references')
	}

	context.ancestors.add(input)

	try {
		let expression: QueryFilterNode<TSchema> | undefined

		for (const [key, value] of Object.entries(input)) {
			expression = combineWhereExpressions(
				expression,
				normalizeWhereEntry(context, key, value),
			)
		}

		return expression ?? createConstantWhereExpression(true)
	} finally {
		context.ancestors.delete(input)
	}
}

/** Validates and snapshots one public where object into the existing QueryBuilder AST. */
export const normalizeWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereInput<TSchema>,
): QueryFilterNode<TSchema> =>
	normalizeWhereRecord(
		{ schema, relationDepth: 0, ancestors: new WeakSet<object>() },
		input,
	)
