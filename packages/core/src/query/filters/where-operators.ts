import { Pointer, Schema, type SchemaDefinition } from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import type { QueryFieldName } from '../ast/contracts.js'
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
import type { QueryFilterNode } from './logical.js'
import type {
	QueryFieldPath,
	QueryFilterTarget,
	QueryJsonPathExpression,
	QueryRegexPattern,
} from './primitive.js'

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

export const assertEnabledWhereFlag = (input: unknown, path: string): void => {
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

export const normalizeWhereOperator = <TSchema extends SchemaDefinition>(
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
			return createQueryStructuralFilter(schema, 'contains', target, operand)
		case 'containedBy':
			return createQueryStructuralFilter(
				schema,
				'contained-by',
				target,
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
