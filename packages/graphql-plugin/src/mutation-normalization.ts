import {
	decrement,
	getFieldListDepth,
	getFieldSchemaTarget,
	increment,
	Pointer,
	type ApplicationSchemaMutationRequest,
	type GenericField,
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
import { normalizeGraphqlCollectionArguments } from './read-normalization.js'
import { decodeGraphqlFieldValue, decodeGraphqlWhere } from './read-values.js'
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

const numericKinds = new Set(['bigint', 'decimal', 'float', 'int'])

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

const decodeData = (
	schema: SchemaDefinition,
	value: unknown,
	mode: 'create' | 'update',
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				const field: GenericField | undefined = schema.fields[name]
				if (field === undefined) return [name, item]
				if (mode === 'create') {
					if (field.kind === 'pointer' && typeof item === 'string') {
						const target = getFieldSchemaTarget(field)?.()
						return [
							name,
							target === undefined ? item : new Pointer(target, item),
						]
					}
					return [name, decodeGraphqlFieldValue(field, item, false)]
				}
				if (!isPlainRecord(item) || Object.keys(item).length !== 1) {
					return [name, item]
				}
				const [operator] = Object.keys(item)
				const operand =
					operator === undefined
						? undefined
						: decodeGraphqlFieldValue(field, item[operator], false)
				if (operator === 'set') {
					if (field.kind === 'pointer' && typeof operand === 'string') {
						const target = getFieldSchemaTarget(field)?.()
						return [
							name,
							target === undefined ? operand : new Pointer(target, operand),
						]
					}
					return [name, operand]
				}
				if (
					getFieldListDepth(field.options) === 0 &&
					numericKinds.has(field.kind) &&
					(operator === 'increment' || operator === 'decrement')
				) {
					const numeric = operand as bigint | number | string
					return [
						name,
						operator === 'increment' ? increment(numeric) : decrement(numeric),
					]
				}
				return [name, item]
			}),
		),
	)
}

const decodeUpsert = (schema: SchemaDefinition, value: unknown): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord({
		...value,
		...(Object.hasOwn(value, 'where')
			? { where: decodeGraphqlWhere(schema, value.where) }
			: {}),
		...(Object.hasOwn(value, 'create')
			? { create: decodeData(schema, value.create, 'create') }
			: {}),
		...(Object.hasOwn(value, 'update')
			? { update: decodeData(schema, value.update, 'update') }
			: {}),
	})
}

const mutationInput = (
	schema: SchemaDefinition,
	operation: GraphqlMutationOperation,
	input: Readonly<Record<string, unknown>>,
): unknown => {
	if (operation === 'create')
		return { data: decodeData(schema, input, 'create') }
	if (operation === 'update') {
		return {
			...input,
			...(Object.hasOwn(input, 'where')
				? { where: decodeGraphqlWhere(schema, input.where) }
				: {}),
			data: decodeData(schema, input.data, 'update'),
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
					return decodeData(schema, item, 'create')
				}
				if (operation === 'bulkUpsert') return decodeUpsert(schema, item)
				if (!isPlainRecord(item)) return item
				return immutableRecord({
					...item,
					where: decodeGraphqlWhere(schema, item.where),
					data: decodeData(schema, item.data, 'update'),
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
