import {
	type ApplicationSchemaMutationRequest,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { GraphQLResolveInfo } from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import { decodeGraphqlMutationData } from './nested-mutation-values.js'
import { normalizeGraphqlCollectionArguments } from './read-normalization.js'
import { decodeGraphqlWhere } from './read-values.js'
import { normalizeGraphqlSelection } from './selection-normalization.js'

/** Names generated mutations independently from their GraphQL root spelling. */
export type GraphqlMutationOperation =
	| 'bulkCreate'
	| 'bulkDelete'
	| 'bulkUpdate'
	| 'bulkUpsert'
	| 'create'
	| 'delete'
	| 'update'
	| 'upsert'

type CoreMutationKindFor<TOperation extends GraphqlMutationOperation> =
	TOperation extends `bulk${infer TKind}`
		? `${Lowercase<TKind & string>}-many`
		: `${TOperation}-one`

/** Resolves the exact Core command produced by one generated mutation. */
export type GraphqlMutationCommand<
	TSchema extends SchemaDefinition,
	TOperation extends GraphqlMutationOperation,
> = Extract<
	ApplicationSchemaMutationRequest<TSchema>,
	{ readonly kind: CoreMutationKindFor<TOperation> }
>

const mutationKinds: Readonly<
	Record<GraphqlMutationOperation, ApplicationSchemaMutationRequest['kind']>
> = immutableRecord({
	bulkCreate: 'create-many',
	bulkDelete: 'delete-many',
	bulkUpdate: 'update-many',
	bulkUpsert: 'upsert-many',
	create: 'create-one',
	delete: 'delete-one',
	update: 'update-one',
	upsert: 'upsert-one',
})

const readInput = (args: unknown): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(args) ||
		Reflect.ownKeys(args).length !== 1 ||
		!Object.hasOwn(args, 'input') ||
		!isPlainRecord(args.input)
	) {
		throw new TypeError('GraphQL mutation requires one input object')
	}
	return args.input
}

const decodeUpsert = (schema: SchemaDefinition, value: unknown): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord({
		...value,
		...(Object.hasOwn(value, 'where')
			? { where: decodeGraphqlWhere(schema, value.where) }
			: {}),
		...(Object.hasOwn(value, 'create')
			? {
					create: decodeGraphqlMutationData(
						schema,
						value.create,
						'create',
						'flat',
					),
				}
			: {}),
		...(Object.hasOwn(value, 'update')
			? {
					update: decodeGraphqlMutationData(
						schema,
						value.update,
						'update',
						'flat',
					),
				}
			: {}),
	})
}

const mutationInput = (
	schema: SchemaDefinition,
	operation: GraphqlMutationOperation,
	input: Readonly<Record<string, unknown>>,
): unknown => {
	if (operation === 'create')
		return {
			data: decodeGraphqlMutationData(schema, input, 'create', 'nested'),
		}
	if (operation === 'update') {
		return {
			...input,
			...(Object.hasOwn(input, 'where')
				? { where: decodeGraphqlWhere(schema, input.where) }
				: {}),
			data: decodeGraphqlMutationData(schema, input.data, 'update', 'nested'),
		}
	}
	if (operation === 'delete') {
		return {
			...input,
			...(Object.hasOwn(input, 'where')
				? { where: decodeGraphqlWhere(schema, input.where) }
				: {}),
		}
	}
	if (operation === 'upsert') return decodeUpsert(schema, input)
	if (operation === 'bulkDelete') {
		return {
			where: isUnknownArray(input.where)
				? immutableArray(
						input.where.map((where) => decodeGraphqlWhere(schema, where)),
					)
				: input.where,
		}
	}
	if (!isUnknownArray(input.data)) return input
	return {
		data: immutableArray(
			input.data.map((item) => {
				if (operation === 'bulkCreate') {
					return decodeGraphqlMutationData(schema, item, 'create', 'flat')
				}
				if (operation === 'bulkUpsert') return decodeUpsert(schema, item)
				if (!isPlainRecord(item)) return item
				return immutableRecord({
					...item,
					where: decodeGraphqlWhere(schema, item.where),
					data: decodeGraphqlMutationData(schema, item.data, 'update', 'flat'),
				})
			}),
		),
	}
}

/** Converts one generated mutation into Core's closed schema-command union. */
export const normalizeGraphqlMutation = <
	const TSchema extends SchemaDefinition,
	const TOperation extends GraphqlMutationOperation,
>(
	schema: TSchema,
	operation: TOperation,
	args: unknown,
	info: GraphQLResolveInfo,
	connections: GraphqlConnectionRuntime,
): GraphqlMutationCommand<TSchema, TOperation> => {
	const input = readInput(args)
	const relationships =
		operation === 'delete' ||
		operation === 'bulkDelete' ||
		operation === 'upsert' ||
		operation === 'bulkUpsert'
			? 'stored-pointer-only'
			: 'include'
	const projection = normalizeGraphqlSelection(
		schema,
		info,
		false,
		(target, relationArgs, scope) =>
			normalizeGraphqlCollectionArguments(
				target,
				relationArgs,
				connections,
				scope,
			),
		relationships,
	)
	const commandInput = immutableRecord({
		...(mutationInput(schema, operation, input) as Readonly<
			Record<string, unknown>
		>),
		...projection,
	})
	return immutableRecord({
		kind: mutationKinds[operation],
		input: commandInput,
	}) as GraphqlMutationCommand<TSchema, TOperation>
}
