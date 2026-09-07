import {
	normalizeReadOperation,
	type ReadOperationAstForKind,
	type ReadOperationKind,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { getNamedType, isObjectType, type GraphQLResolveInfo } from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import { decodeGraphqlWhere } from './read-values.js'
import { normalizeGraphqlOrdering } from './read-ordering.js'
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

export interface GraphqlReadNormalizationContext {
	readonly connections: GraphqlConnectionRuntime
}

export interface GraphqlConnectionScope {
	readonly relationPath: readonly string[]
	readonly typeName: string
}

/** Converts collection arguments into existing Core query clauses. */
export const normalizeGraphqlCollectionArguments = (
	schema: SchemaDefinition,
	args: Readonly<Record<string, unknown>>,
	connections: GraphqlConnectionRuntime,
	scope: GraphqlConnectionScope,
): Readonly<Record<string, unknown>> =>
	connections.prepare({
		arguments: args,
		relationPath: scope.relationPath,
		schema,
		typeName: scope.typeName,
	}).clauses

const projectionFor = (
	schema: SchemaDefinition,
	operation: GraphqlReadOperation,
	info: GraphQLResolveInfo | undefined,
	context: GraphqlReadNormalizationContext,
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
		(relationSchema, args, scope) =>
			normalizeGraphqlCollectionArguments(
				relationSchema,
				args,
				context.connections,
				scope,
			),
	)
}

const connectionTypeName = (info: GraphQLResolveInfo): string => {
	const connection = getNamedType(info.returnType)
	if (!isObjectType(connection)) {
		throw new TypeError('GraphQL connection result must be an object type')
	}
	const model = getNamedType(connection.getFields().nodes?.type)
	if (!model || !isObjectType(model)) {
		throw new TypeError('GraphQL connection model type is malformed')
	}
	return model.name
}

/** Normalizes GraphQL arguments and selections into a transport-free Core AST. */
export const normalizeGraphqlReadOperation = <
	const TSchema extends SchemaDefinition,
	const TOperation extends GraphqlReadOperation,
>(
	schema: TSchema,
	operation: TOperation,
	args: unknown,
	info: GraphQLResolveInfo | undefined,
	context: GraphqlReadNormalizationContext,
): GraphqlReadOperationAst<TSchema, TOperation> => {
	const source = assertArguments(args, operation)
	const input: Record<string, unknown> = {}
	if (operation === 'get') {
		input.id = source.id
	} else if (operation === 'findMany') {
		if (info === undefined) {
			throw new TypeError(
				'GraphQL findMany normalization requires selection info',
			)
		}
		Object.assign(
			input,
			normalizeGraphqlCollectionArguments(schema, source, context.connections, {
				relationPath: [],
				typeName: connectionTypeName(info),
			}),
		)
	} else {
		if (source.where !== undefined && source.where !== null) {
			input.where = decodeGraphqlWhere(schema, source.where)
		}
		if (source.orderBy !== undefined && source.orderBy !== null) {
			input.orderBy = normalizeGraphqlOrdering(source.orderBy)
		}
	}
	const projection = projectionFor(schema, operation, info, context)
	if (projection !== undefined) Object.assign(input, projection)
	return normalizeReadOperation(
		schema,
		coreReadKinds[operation],
		immutableRecord(input),
	)
}
