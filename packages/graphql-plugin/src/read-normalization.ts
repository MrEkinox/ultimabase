import {
	normalizeReadOperation,
	type ReadOperationAstForKind,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { getNamedType, isObjectType, type GraphQLResolveInfo } from 'graphql'

import type {
	GraphqlConnectionPagePlan,
	GraphqlConnectionRuntime,
} from './connection-runtime.js'
import { normalizeGraphqlSelection } from './selection-normalization.js'

export {
	normalizeGraphqlCollectionArguments,
	type GraphqlConnectionScope,
} from './selection-normalization.js'
import { decodeGraphqlWhere } from './wire-values.js'

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

const readContracts: Readonly<
	Record<
		GraphqlReadOperation,
		Readonly<{
			kind: CoreReadKindFor<GraphqlReadOperation>
			args: ReadonlySet<string>
		}>
	>
> = {
	count: { kind: 'count', args: new Set(['where']) },
	exists: { kind: 'exists', args: new Set(['where']) },
	findMany: {
		kind: 'find-many',
		args: new Set(['after', 'first', 'orderBy', 'where']),
	},
	findOne: { kind: 'find-one', args: new Set(['orderBy', 'where']) },
	get: { kind: 'get', args: new Set(['id']) },
}

export interface GraphqlReadNormalizationContext {
	readonly connections: GraphqlConnectionRuntime
}

/** Retains transport page metadata beside, never inside, the Core read AST. */
export interface GraphqlPreparedReadOperation<
	TSchema extends SchemaDefinition,
	TOperation extends GraphqlReadOperation,
> {
	readonly operation: GraphqlReadOperationAst<TSchema, TOperation>
	readonly page?: GraphqlConnectionPagePlan
}

/** Converts the ordered GraphQL representation into Core's object input. */
const normalizeGraphqlOrdering = (
	value: unknown,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL orderBy must be a list')
	}
	const order = new Map<string, 'asc' | 'desc'>()
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
		if (order.has(item.field)) {
			throw new TypeError(`GraphQL orderBy repeats field ${item.field}`)
		}
		order.set(item.field, item.direction)
	}
	return immutableRecord(Object.fromEntries(order))
}

/** Adds the accepted deterministic ID order without changing prior priority. */
export const effectiveGraphqlConnectionOrdering = (
	value: unknown,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	const order =
		value === undefined || value === null
			? immutableRecord<Record<string, 'asc' | 'desc'>>({})
			: normalizeGraphqlOrdering(value)
	return Object.hasOwn(order, 'id')
		? order
		: immutableRecord({ ...order, id: 'asc' })
}

const requireInfo = (
	info: GraphQLResolveInfo | undefined,
	operation: GraphqlReadOperation,
): GraphQLResolveInfo => {
	if (info === undefined) {
		throw new TypeError(
			`GraphQL ${operation} normalization requires selection info`,
		)
	}
	return info
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

/** Prepares one read while retaining Relay metadata outside the Core request. */
export const prepareGraphqlReadOperation = <
	const TSchema extends SchemaDefinition,
	const TOperation extends GraphqlReadOperation,
>(
	schema: TSchema,
	operation: TOperation,
	args: unknown,
	info: GraphQLResolveInfo | undefined,
	context: GraphqlReadNormalizationContext,
): GraphqlPreparedReadOperation<TSchema, TOperation> => {
	const contract = readContracts[operation]
	if (!isPlainRecord(args)) {
		throw new TypeError(`GraphQL ${operation} arguments must be an object`)
	}
	for (const key of Object.keys(args)) {
		if (!contract.args.has(key)) {
			throw new TypeError(
				`GraphQL ${operation} contains an unknown argument: ${key}`,
			)
		}
	}
	let input: Readonly<Record<string, unknown>>
	let page: GraphqlConnectionPagePlan | undefined
	if (operation === 'get') {
		input = { id: args.id }
	} else if (operation === 'findMany') {
		const prepared = context.connections.prepare({
			arguments: args,
			relationPath: [],
			schema,
			typeName: connectionTypeName(requireInfo(info, operation)),
		})
		input = prepared.clauses
		page = prepared.page
	} else {
		input = {
			...(args.where === undefined || args.where === null
				? {}
				: { where: decodeGraphqlWhere(schema, args.where) }),
			...(args.orderBy === undefined || args.orderBy === null
				? {}
				: { orderBy: normalizeGraphqlOrdering(args.orderBy) }),
		}
	}
	// Counts and existence checks carry no selection.
	const projection =
		operation === 'count' || operation === 'exists'
			? undefined
			: normalizeGraphqlSelection(
					schema,
					requireInfo(info, operation),
					operation === 'findMany',
					context.connections,
				)
	const normalized = normalizeReadOperation(
		schema,
		contract.kind,
		immutableRecord({ ...input, ...projection }),
	) as GraphqlReadOperationAst<TSchema, TOperation>
	return immutableRecord({
		operation: normalized,
		...(page === undefined ? {} : { page }),
	})
}
