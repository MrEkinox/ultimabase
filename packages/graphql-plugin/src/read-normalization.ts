import {
	normalizeReadOperation,
	type ReadOperationAstForKind,
	type ReadOperationKind,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { GraphQLResolveInfo } from 'graphql'

import { decodeGraphqlWhere } from './read-values.js'
import {
	normalizeGraphqlSelection,
	type GraphqlReadProjection,
} from './selection-normalization.js'

/** Names generated reads independently from GraphQL root field spelling. */
export type GraphqlReadOperation =
	'count' | 'exists' | 'findMany' | 'findOne' | 'get'

type CoreReadKindFor<TOperation extends GraphqlReadOperation> =
	TOperation extends 'findMany'
		? 'find-many'
		: TOperation extends 'findOne'
			? 'find-one'
			: TOperation

/** Resolves the exact Core AST produced by one GraphQL read operation. */
export type GraphqlReadOperationAst<
	TSchema extends SchemaDefinition,
	TOperation extends GraphqlReadOperation,
> = ReadOperationAstForKind<TSchema, CoreReadKindFor<TOperation>>

const coreReadKinds: Readonly<Record<GraphqlReadOperation, ReadOperationKind>> =
	immutableRecord({
		count: 'count',
		exists: 'exists',
		findMany: 'find-many',
		findOne: 'find-one',
		get: 'get',
	})

const argumentKeys: Readonly<
	Record<GraphqlReadOperation, ReadonlySet<string>>
> = immutableRecord({
	count: new Set(['where']),
	exists: new Set(['where']),
	findMany: new Set(['after', 'first', 'orderBy', 'where']),
	findOne: new Set(['orderBy', 'where']),
	get: new Set(['id']),
})

const assertArguments = (
	value: unknown,
	operation: GraphqlReadOperation,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`GraphQL ${operation} arguments must be an object`)
	}
	for (const key of Object.keys(value)) {
		if (!argumentKeys[operation].has(key)) {
			throw new TypeError(
				`GraphQL ${operation} contains an unknown argument: ${key}`,
			)
		}
	}
	return value
}

const normalizeOrdering = (
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL orderBy must be a list')
	}
	const order: Record<string, 'asc' | 'desc'> = {}
	for (const [index, item] of value.entries()) {
		if (
			!isPlainRecord(item) ||
			typeof item.field !== 'string' ||
			(item.direction !== 'asc' && item.direction !== 'desc')
		) {
			throw new TypeError(
				`GraphQL orderBy[${String(index)}] must contain a field and direction`,
			)
		}
		if (Object.hasOwn(order, item.field)) {
			throw new TypeError(`GraphQL orderBy repeats field ${item.field}`)
		}
		order[item.field] = item.direction
	}
	return immutableRecord(order)
}

/** Converts collection arguments into existing Core query clauses. */
export const normalizeGraphqlCollectionArguments = (
	_schema: SchemaDefinition,
	args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const input: Record<string, unknown> = {}
	if (Object.hasOwn(args, 'after') && args.after !== undefined) {
		throw new TypeError('GraphQL cursor normalization is not available')
	}
	if (Object.hasOwn(args, 'first') && args.first !== undefined) {
		if (
			typeof args.first !== 'number' ||
			!Number.isSafeInteger(args.first) ||
			args.first < 1 ||
			args.first > 100
		) {
			throw new RangeError('GraphQL first must be a safe integer from 1 to 100')
		}
		input.limit = args.first
	}
	if (Object.hasOwn(args, 'orderBy')) {
		input.orderBy = normalizeOrdering(args.orderBy)
	}
	if (Object.hasOwn(args, 'where')) {
		input.where = decodeGraphqlWhere(_schema, args.where)
	}
	return immutableRecord(input)
}

const projectionFor = (
	schema: SchemaDefinition,
	operation: GraphqlReadOperation,
	info: GraphQLResolveInfo | undefined,
): GraphqlReadProjection | undefined => {
	if (operation === 'count' || operation === 'exists') return undefined
	if (info === undefined) {
		throw new TypeError(
			`GraphQL ${operation} normalization requires selection info`,
		)
	}
	return normalizeGraphqlSelection(
		schema,
		info,
		operation === 'findMany',
		normalizeGraphqlCollectionArguments,
	)
}

/** Normalizes GraphQL arguments and selections into a transport-free Core AST. */
export const normalizeGraphqlReadOperation = <
	const TSchema extends SchemaDefinition,
	const TOperation extends GraphqlReadOperation,
>(
	schema: TSchema,
	operation: TOperation,
	args: unknown,
	info?: GraphQLResolveInfo,
): GraphqlReadOperationAst<TSchema, TOperation> => {
	const source = assertArguments(args, operation)
	const input: Record<string, unknown> = {}
	if (operation === 'get') {
		input.id = source.id
	} else if (operation === 'findMany') {
		Object.assign(input, normalizeGraphqlCollectionArguments(schema, source))
	} else {
		if (Object.hasOwn(source, 'where')) {
			input.where = decodeGraphqlWhere(schema, source.where)
		}
		if (Object.hasOwn(source, 'orderBy')) {
			input.orderBy = normalizeOrdering(source.orderBy)
		}
	}
	const projection = projectionFor(schema, operation, info)
	if (projection !== undefined) Object.assign(input, projection)
	return normalizeReadOperation(
		schema,
		coreReadKinds[operation],
		immutableRecord(input),
	)
}
