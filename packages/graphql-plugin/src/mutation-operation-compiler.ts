import type { SchemaDefinition } from '@ultimabase/core'
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	type GraphQLFieldConfigMap,
	type GraphQLInputFieldConfigMap,
	type GraphQLNamedType,
} from 'graphql'

import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import type { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { assertGraphqlFieldName } from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

/** Generates exact schema-command inputs and their mutation root resolvers. */
export class GraphqlMutationOperationCompiler {
	readonly #execution: GraphqlGeneratedExecution
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #filters: GraphqlFilterInputCompiler
	readonly #inputs: GraphqlMutationInputCompiler
	readonly #names: GraphqlNameRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #types: GraphQLNamedType[] = []

	constructor(
		options: Readonly<{
			readonly execution: GraphqlGeneratedExecution
			readonly fields: GraphqlFieldTypeCompiler
			readonly filters: GraphqlFilterInputCompiler
			readonly inputs: GraphqlMutationInputCompiler
			readonly names: GraphqlNameRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#execution = options.execution
		this.#fields = options.fields
		this.#filters = options.filters
		this.#inputs = options.inputs
		this.#names = options.names
		this.#surfaces = options.surfaces
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#types
	}

	#input(
		surface: GraphqlSchemaSurface,
		suffix: string,
		fields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType {
		const name = `${surface.typeName}${suffix}`
		this.#names.claimType(name, {
			description: graphqlSourceDescription(surface.schema),
			owner: surface.owner,
		})
		const type = new GraphQLInputObjectType({ name, fields })
		this.#types.push(type)
		return type
	}

	#root(
		fields: GraphQLFieldConfigMap<unknown, unknown>,
		surface: GraphqlSchemaSurface,
		operation:
			| 'bulkCreate'
			| 'bulkDelete'
			| 'bulkUpdate'
			| 'bulkUpsert'
			| 'create'
			| 'delete'
			| 'update'
			| 'upsert',
		input: GraphQLInputObjectType,
		type: GraphQLFieldConfigMap<unknown, unknown>[string]['type'],
	): void {
		if (!surface[operation]) return
		const fieldName = operation.startsWith('bulk')
			? `${operation.replace('bulk', '').toLowerCase()}Many${surface.typeName}`
			: `${operation}${surface.typeName}`
		assertGraphqlFieldName(
			fieldName,
			`generated ${operation} operation for ${surface.schema.className}`,
			surface.owner,
		)
		fields[fieldName] = {
			args: { input: { type: new GraphQLNonNull(input) } },
			resolve: this.#execution.mutation(surface.schema, operation),
			type,
		}
	}

	#surfaceFields(
		fields: GraphQLFieldConfigMap<unknown, unknown>,
		surface: GraphqlSchemaSurface,
	): void {
		const schema = surface.schema
		const model = this.#fields.model(schema)
		const create = this.#inputs.createInput(schema)
		const update = this.#inputs.updateInput(schema)
		const where = this.#filters.where(schema)
		const modelList = new GraphQLNonNull(
			new GraphQLList(new GraphQLNonNull(model)),
		)

		if (create !== undefined) {
			this.#root(fields, surface, 'create', create, new GraphQLNonNull(model))
			if (surface.bulkCreate) {
				const createMany = this.#input(surface, 'CreateManyInput', () => ({
					data: {
						type: new GraphQLNonNull(
							new GraphQLList(new GraphQLNonNull(create)),
						),
					},
				}))
				this.#root(fields, surface, 'bulkCreate', createMany, modelList)
			}
		}

		if (update !== undefined) {
			if (surface.update) {
				const updateOne = this.#input(surface, 'UpdateOneInput', () => ({
					data: { type: new GraphQLNonNull(update) },
					id: { type: GraphQLID },
					where: { type: where },
				}))
				this.#root(fields, surface, 'update', updateOne, model)
			}
			if (surface.bulkUpdate) {
				const updateItem = this.#input(surface, 'UpdateManyItemInput', () => ({
					data: { type: new GraphQLNonNull(update) },
					where: { type: new GraphQLNonNull(where) },
				}))
				const updateMany = this.#input(surface, 'UpdateManyInput', () => ({
					data: {
						type: new GraphQLNonNull(
							new GraphQLList(new GraphQLNonNull(updateItem)),
						),
					},
				}))
				this.#root(fields, surface, 'bulkUpdate', updateMany, modelList)
			}
		}

		if (surface.delete) {
			const deleteOne = this.#input(surface, 'DeleteOneInput', () => ({
				id: { type: GraphQLID },
				where: { type: where },
			}))
			this.#root(fields, surface, 'delete', deleteOne, model)
		}
		if (surface.bulkDelete) {
			const deleteMany = this.#input(surface, 'DeleteManyInput', () => ({
				where: {
					type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(where))),
				},
			}))
			this.#root(fields, surface, 'bulkDelete', deleteMany, modelList)
		}

		if (create !== undefined && update !== undefined) {
			if (surface.upsert || surface.bulkUpsert) {
				const upsertOne = this.#input(surface, 'UpsertOneInput', () => ({
					create: { type: new GraphQLNonNull(create) },
					update: { type: new GraphQLNonNull(update) },
					where: { type: new GraphQLNonNull(where) },
				}))
				if (surface.upsert) {
					this.#root(
						fields,
						surface,
						'upsert',
						upsertOne,
						new GraphQLNonNull(model),
					)
				}
				if (surface.bulkUpsert) {
					const upsertMany = this.#input(surface, 'UpsertManyInput', () => ({
						data: {
							type: new GraphQLNonNull(
								new GraphQLList(new GraphQLNonNull(upsertOne)),
							),
						},
					}))
					this.#root(fields, surface, 'bulkUpsert', upsertMany, modelList)
				}
			}
		}
	}

	mutationType(): GraphQLObjectType | undefined {
		const fields: GraphQLFieldConfigMap<unknown, unknown> = {}
		for (const surface of this.#surfaces.values()) {
			if (surface.owner.kind === 'application') {
				this.#surfaceFields(fields, surface)
			}
		}
		if (Object.keys(fields).length === 0) return undefined
		return new GraphQLObjectType({ name: 'Mutation', fields })
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLInputObjectType) type.getFields()
		}
	}
}
