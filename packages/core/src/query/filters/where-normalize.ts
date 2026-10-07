import {
	Schema,
	type SchemaDefinition,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { createQueryAst } from '../ast/factory.js'
import type { QueryFieldName } from '../ast/contracts.js'
import { parsePersistedQueryFieldName as parseQueryFieldName } from '../ast/schema.js'
import { fieldPath } from './factory.js'
import { normalizeLogicalFilter, type QueryFilterNode } from './logical.js'
import {
	assertEnabledWhereFlag,
	normalizeWhereOperator,
} from './where-operators.js'
import {
	createQueryRelationCount,
	createQueryRelationDepthError,
	queryRelationPredicateMaxDepth,
	type QueryRelationCountInput,
	type QueryRelationPredicateNode,
	type QueryRelationPredicateOperator,
	type QueryPointerPredicateNode,
} from './relation.js'
import type { WhereInput } from './where-contracts.js'

export const combineWhereExpressions = <TSchema extends SchemaDefinition>(
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

export const createConstantWhereExpression = <TSchema extends SchemaDefinition>(
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
