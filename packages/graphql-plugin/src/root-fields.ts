import type { SchemaDefinition } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLFieldConfig,
	type GraphQLFieldConfigArgumentMap,
	type GraphQLFieldConfigMap,
	type GraphQLInputFieldConfigMap,
	type GraphQLOutputType,
} from 'graphql'

import {
	assertGraphqlFieldName,
	nonNullList,
	type GraphqlCompileContext,
} from './compile-context.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import type { GraphqlWriteRoot } from './exposure.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import type { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import type { GraphqlMutationOperation } from './mutation-normalization.js'
import type { GraphqlReadOperation } from './read-normalization.js'
import { GraphqlSafeInt } from './scalars.js'
import {
	graphqlOperationMethods,
	type GraphqlSchemaSurface,
} from './surfaces.js'

type RootFields = GraphQLFieldConfigMap<unknown, unknown>

/** Supplies the compilers shared by generated query and mutation roots. */
export interface GraphqlRootCompilers {
	readonly ctx: GraphqlCompileContext
	readonly execution: GraphqlGeneratedExecution
	readonly fields: GraphqlFieldTypeCompiler
	readonly filters: GraphqlFilterInputCompiler
	readonly inputs: GraphqlMutationInputCompiler
	readonly defaultTake: number
}

const readOperations: readonly GraphqlReadOperation[] = [
	'get',
	'findOne',
	'findMany',
	'count',
	'exists',
]
const mutationOperations: readonly GraphqlMutationOperation[] = [
	'create',
	'update',
	'delete',
	'upsert',
	'bulkCreate',
	'bulkUpdate',
	'bulkDelete',
	'bulkUpsert',
]

/** Names one generated root field (`createTodo`, `createManyTodo`). */
const rootFieldName = (
	operation: GraphqlReadOperation | GraphqlMutationOperation,
	typeName: string,
): string =>
	operation.startsWith('bulk')
		? `${operation.replace('bulk', '').toLowerCase()}Many${typeName}`
		: `${operation}${typeName}`

/** A disabled root of an application schema names how to enable it (ADR-0325). */
const addDisabledRootHints = (
	ctx: GraphqlCompileContext,
	surface: GraphqlSchemaSurface,
): void => {
	if (surface.owner.kind !== 'application') return
	for (const [root, operations] of [
		['Query', readOperations],
		['Mutation', mutationOperations],
	] as const) {
		for (const operation of operations) {
			if (surface[operation]) continue
			ctx.hints.add(
				root,
				rootFieldName(operation, surface.typeName),
				graphqlOperationMethods[operation],
				surface.schema.className,
			)
		}
	}
}

/** Adds one enabled root and returns its field name. */
const addRoot = (
	fields: RootFields,
	surface: GraphqlSchemaSurface,
	operation: GraphqlReadOperation | GraphqlMutationOperation,
	config: () => GraphQLFieldConfig<unknown, unknown>,
): string | undefined => {
	if (!surface[operation]) return undefined
	const fieldName = rootFieldName(operation, surface.typeName)
	assertGraphqlFieldName(
		fieldName,
		`generated ${operation} operation for ${surface.schema.className}`,
		surface.owner,
	)
	fields[fieldName] = config()
	return fieldName
}

/**
 * Declares the Relay window and filters of a root or relation collection field;
 * a relation pages by position in every parent (ADR-0309, step 3b amendment).
 */
export const graphqlCollectionArguments = (
	compilers: GraphqlRootCompilers,
	schema: SchemaDefinition,
): GraphQLFieldConfigArgumentMap => ({
	after: { type: GraphQLString },
	first: { default: { value: compilers.defaultTake }, type: GraphQLInt },
	orderBy: { type: nonNullList(compilers.filters.order(schema)) },
	where: { type: compilers.filters.where(schema) },
})

/**
 * Generates read roots; their argument types exist for every exposed schema
 * surface, and a hidden one only names how to enable its roots (ADR-0333).
 */
export const compileGraphqlQueryFields = (
	compilers: GraphqlRootCompilers,
): RootFields => {
	const { ctx, execution, fields: types, filters } = compilers
	const fields: RootFields = {}
	for (const surface of ctx.surfaces.values()) {
		addDisabledRootHints(ctx, surface)
		if (!surface.exposed) continue
		const { schema } = surface
		const where = { where: { type: filters.where(schema) } }
		const model = types.model(schema)
		const orderBy = { type: nonNullList(filters.order(schema)) }
		const collection = graphqlCollectionArguments(compilers, schema)
		const connection = new GraphQLNonNull(types.connectionType(schema))
		const root = (
			operation: GraphqlReadOperation,
			args: GraphQLFieldConfigArgumentMap,
			type: GraphQLOutputType,
		): void => {
			addRoot(fields, surface, operation, () => ({
				args,
				resolve: execution.read(schema, operation),
				type,
			}))
		}
		root('get', { id: { type: new GraphQLNonNull(GraphQLID) } }, model)
		root('findOne', { orderBy, ...where }, model)
		root('findMany', collection, connection)
		root('count', where, new GraphQLNonNull(GraphqlSafeInt))
		root('exists', where, new GraphQLNonNull(GraphQLBoolean))
	}
	return fields
}

const surfaceMutationFields = (
	compilers: GraphqlRootCompilers,
	fields: RootFields,
	writes: GraphqlWriteRoot[],
	surface: GraphqlSchemaSurface,
): void => {
	const { ctx, execution, inputs } = compilers
	const { schema, typeName } = surface
	const input = (
		suffix: string,
		inputFields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType => {
		ctx.claim(`${typeName}${suffix}`, schema)
		return ctx.add(
			'rootInputs',
			new GraphQLInputObjectType({
				name: `${typeName}${suffix}`,
				fields: inputFields,
			}),
		)
	}
	const root = (
		operation: GraphqlMutationOperation,
		argument: GraphQLInputObjectType,
		type: GraphQLOutputType,
	): void => {
		const field = addRoot(fields, surface, operation, () => ({
			args: { input: { type: new GraphQLNonNull(argument) } },
			resolve: execution.mutation(schema, operation),
			type,
		}))
		const method = surface.methods.get(graphqlOperationMethods[operation])
		if (field !== undefined && method !== undefined) {
			writes.push({ field, write: { method, schema: schema.className } })
		}
	}
	const model = compilers.fields.model(schema)
	const create = inputs.createInput(schema)
	const update = inputs.updateInput(schema)
	// Flat inputs exist only when a bulk or upsert operation needs them.
	const flatCreate =
		surface.bulkCreate || surface.bulkUpsert || surface.upsert
			? inputs.flatCreateInput(schema)
			: undefined
	const flatUpdate =
		surface.bulkUpdate || surface.bulkUpsert || surface.upsert
			? inputs.flatUpdateInput(schema)
			: undefined
	const where = compilers.filters.where(schema)
	const modelList = new GraphQLNonNull(nonNullList(model))
	const list = (type: GraphQLInputObjectType) => ({
		type: new GraphQLNonNull(nonNullList(type)),
	})

	if (create !== undefined) {
		root('create', create, new GraphQLNonNull(model))
		if (surface.bulkCreate && flatCreate !== undefined) {
			const createMany = input('CreateManyInput', () => ({
				data: list(flatCreate),
			}))
			root('bulkCreate', createMany, modelList)
		}
	}
	if (update !== undefined) {
		if (surface.update) {
			const updateOne = input('UpdateOneInput', () => ({
				data: { type: new GraphQLNonNull(update) },
				where: { type: new GraphQLNonNull(where) },
			}))
			root('update', updateOne, model)
		}
		if (surface.bulkUpdate && flatUpdate !== undefined) {
			const updateItem = input('UpdateManyItemInput', () => ({
				data: { type: new GraphQLNonNull(flatUpdate) },
				where: { type: new GraphQLNonNull(where) },
			}))
			const updateMany = input('UpdateManyInput', () => ({
				data: list(updateItem),
			}))
			root('bulkUpdate', updateMany, modelList)
		}
	}
	if (surface.delete) {
		const deleteOne = input('DeleteOneInput', () => ({
			where: { type: new GraphQLNonNull(where) },
		}))
		root('delete', deleteOne, model)
	}
	if (surface.bulkDelete) {
		const deleteMany = input('DeleteManyInput', () => ({ where: list(where) }))
		root('bulkDelete', deleteMany, modelList)
	}
	if (
		flatCreate !== undefined &&
		flatUpdate !== undefined &&
		(surface.upsert || surface.bulkUpsert)
	) {
		const upsertOne = input('UpsertOneInput', () => ({
			create: { type: new GraphQLNonNull(flatCreate) },
			update: { type: new GraphQLNonNull(flatUpdate) },
			where: { type: new GraphQLNonNull(where) },
		}))
		root('upsert', upsertOne, new GraphQLNonNull(model))
		if (surface.bulkUpsert) {
			const upsertMany = input('UpsertManyInput', () => ({
				data: list(upsertOne),
			}))
			root('bulkUpsert', upsertMany, modelList)
		}
	}
}

/**
 * Generates exact schema-command roots for exposed application schemas only,
 * with the writes they serve in root order.
 */
export const compileGraphqlMutationFields = (
	compilers: GraphqlRootCompilers,
): Readonly<{ fields: RootFields; writes: readonly GraphqlWriteRoot[] }> => {
	const fields: RootFields = {}
	const writes: GraphqlWriteRoot[] = []
	for (const surface of compilers.ctx.surfaces.values()) {
		if (surface.owner.kind === 'application' && surface.exposed) {
			surfaceMutationFields(compilers, fields, writes, surface)
		}
	}
	return { fields, writes }
}
