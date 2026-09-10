import {
	readFieldTypegenState,
	type CompiledSchemaRegistry,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	type GraphQLInputFieldConfigMap,
	type GraphQLNamedType,
} from 'graphql'

import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import {
	readGraphqlFieldDescription,
	readGraphqlFieldOwner,
} from './field-metadata.js'
import { assertGraphqlFieldName, graphqlFieldTypeSegment } from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

type MutationInputMode = 'create' | 'update'

/** Generates recursive singular inputs and separate flat bulk/upsert inputs. */
export class GraphqlMutationInputCompiler {
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #names: GraphqlNameRegistry
	readonly #schemas: CompiledSchemaRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #creates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #flatCreates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #updates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #flatUpdates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #nested = new Map<string, GraphQLInputObjectType>()
	readonly #types: GraphQLNamedType[] = []

	constructor(
		options: Readonly<{
			readonly fieldTypes: GraphqlFieldTypeCompiler
			readonly names: GraphqlNameRegistry
			readonly schemas: CompiledSchemaRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#fieldTypes = options.fieldTypes
		this.#names = options.names
		this.#schemas = options.schemas
		this.#surfaces = options.surfaces
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#types
	}

	#surface(schema: SchemaDefinition): GraphqlSchemaSurface {
		const surface = this.#surfaces.get(schema)
		if (surface === undefined) {
			throw new TypeError('GraphQL schema surface is unavailable')
		}
		return surface
	}

	#target(schema: SchemaDefinition, fieldName: string): SchemaDefinition {
		const target = this.#schemas.schemaTargets.get(schema, [fieldName])
		if (target === undefined) {
			throw new TypeError(
				`Missing compiled target for ${schema.className}.${fieldName}`,
			)
		}
		return target
	}

	#canDisconnectRelation(schema: SchemaDefinition, fieldName: string): boolean {
		const mappedBy = this.#schemas.schemaTargets.getRelation(schema, [
			fieldName,
		])?.mappedBy
		if (mappedBy?.kind !== 'pointer') return true
		const mappedField =
			mappedBy.schema.persistedFields[mappedBy.fieldPath[0] ?? '']
		return (
			mappedField === undefined || readFieldTypegenState(mappedField).nullable
		)
	}

	#input(
		name: string,
		schema: SchemaDefinition,
		path: readonly string[] | undefined,
		fields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema, path),
			owner: schema.definition.provenance.schema.owner,
		})
		const input = new GraphQLInputObjectType({ name, fields })
		this.#types.push(input)
		return input
	}

	#nestedInput(
		key: string,
		name: string,
		schema: SchemaDefinition,
		path: readonly string[],
		fields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType {
		const existing = this.#nested.get(key)
		if (existing !== undefined) return existing
		const input = this.#input(name, schema, path, fields)
		this.#nested.set(key, input)
		return input
	}

	#updateWrapper(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const name = `${this.#surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}Update`
		return this.#nestedInput(
			`${schema.className}\0${path.join('\0')}\0value-update`,
			name,
			schema,
			path,
			() => {
				const valueType = this.#fieldTypes.inputType(field, schema, path)
				const numeric =
					!readFieldTypegenState(field).list &&
					['bigint', 'decimal', 'float', 'int'].includes(field.kind)
				return {
					set: { type: valueType },
					...(numeric
						? {
								increment: { type: valueType },
								decrement: { type: valueType },
							}
						: {}),
				}
			},
		)
	}

	#targetCreateInput(
		source: SchemaDefinition,
		fieldName: string,
		target: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		if (this.#surface(target).owner.kind !== 'application') return undefined
		const mappedBy = this.#schemas.schemaTargets.getRelation(source, [
			fieldName,
		])?.mappedBy
		const omitted =
			mappedBy?.kind === 'pointer' ? mappedBy.fieldPath[0] : undefined
		if (omitted === undefined) return this.createInput(target)

		const eligible = Object.entries(target.persistedFields).some(
			([name, field]) =>
				name !== omitted && this.#fieldAvailable(field, 'create', true),
		)
		if (!eligible) return undefined
		const path = [fieldName]
		const name = `${this.#surface(source).typeName}${graphqlFieldTypeSegment(fieldName)}NestedCreateTargetInput`
		return this.#nestedInput(
			`${source.className}\0${fieldName}\0relation-create-target`,
			name,
			source,
			path,
			() => this.#fields(target, 'create', true, omitted),
		)
	}

	#pointerInput(
		schema: SchemaDefinition,
		fieldName: string,
		mode: MutationInputMode,
		field: GenericField,
	): GraphQLInputObjectType {
		const target = this.#target(schema, fieldName)
		const path = [fieldName]
		const name = `${this.#surface(schema).typeName}${graphqlFieldTypeSegment(fieldName)}Nested${mode === 'create' ? 'Create' : 'Update'}Input`
		return this.#nestedInput(
			`${schema.className}\0${fieldName}\0pointer-${mode}`,
			name,
			schema,
			path,
			() => {
				const create =
					this.#surface(target).owner.kind === 'application'
						? this.createInput(target)
						: undefined
				const update =
					mode === 'update' &&
					this.#surface(target).owner.kind === 'application'
						? this.updateInput(target)
						: undefined
				return {
					connect: { type: GraphQLID },
					...(create === undefined ? {} : { create: { type: create } }),
					...(update === undefined ? {} : { update: { type: update } }),
					...(mode === 'update' && readFieldTypegenState(field).nullable
						? { disconnect: { type: GraphQLBoolean } }
						: {}),
				}
			},
		)
	}

	#relationInput(
		schema: SchemaDefinition,
		fieldName: string,
		mode: MutationInputMode,
	): GraphQLInputObjectType {
		const target = this.#target(schema, fieldName)
		const path = [fieldName]
		const name = `${this.#surface(schema).typeName}${graphqlFieldTypeSegment(fieldName)}Nested${mode === 'create' ? 'Create' : 'Update'}Input`
		return this.#nestedInput(
			`${schema.className}\0${fieldName}\0relation-${mode}`,
			name,
			schema,
			path,
			() => {
				const create = this.#targetCreateInput(schema, fieldName, target)
				const update =
					mode === 'update' &&
					this.#surface(target).owner.kind === 'application'
						? this.updateInput(target)
						: undefined
				const ids = new GraphQLList(new GraphQLNonNull(GraphQLID))
				const updateItem =
					update === undefined
						? undefined
						: this.#nestedInput(
								`${schema.className}\0${fieldName}\0relation-update-item`,
								`${this.#surface(schema).typeName}${graphqlFieldTypeSegment(fieldName)}NestedUpdateItemInput`,
								schema,
								path,
								() => ({
									data: { type: new GraphQLNonNull(update) },
									id: { type: new GraphQLNonNull(GraphQLID) },
								}),
							)
				const canDisconnect = this.#canDisconnectRelation(schema, fieldName)
				return {
					...(create === undefined
						? {}
						: {
								create: {
									type: new GraphQLList(new GraphQLNonNull(create)),
								},
							}),
					connect: { type: ids },
					...(updateItem === undefined
						? {}
						: {
								update: {
									type: new GraphQLList(new GraphQLNonNull(updateItem)),
								},
							}),
					...(mode === 'update' && canDisconnect
						? {
								disconnect: { type: ids },
								set: { type: ids },
								clear: { type: GraphQLBoolean },
							}
						: {}),
				}
			},
		)
	}

	#fieldAvailable(
		field: GenericField,
		mode: MutationInputMode,
		relationships: boolean,
	): boolean {
		if (field.kind === 'relation') return relationships
		return readFieldTypegenState(field)[mode] !== 'forbidden'
	}

	#fields(
		schema: SchemaDefinition,
		mode: MutationInputMode,
		relationships: boolean,
		omitted?: string,
	): GraphQLInputFieldConfigMap {
		const compiled: GraphQLInputFieldConfigMap = {}
		for (const [fieldName, field] of Object.entries(schema.persistedFields)) {
			if (
				fieldName === omitted ||
				!this.#fieldAvailable(field, mode, relationships) ||
				(!relationships &&
					(field.kind === 'pointer' || field.kind === 'relation'))
			) {
				continue
			}
			const path = [fieldName]
			assertGraphqlFieldName(
				fieldName,
				graphqlSourceDescription(schema, path),
				readGraphqlFieldOwner(schema, path),
			)
			const type =
				field.kind === 'pointer'
					? this.#pointerInput(schema, fieldName, mode, field)
					: field.kind === 'relation'
						? this.#relationInput(schema, fieldName, mode)
						: mode === 'create'
							? this.#fieldTypes.inputType(field, schema, path)
							: this.#updateWrapper(field, schema, path)
			const required =
				mode === 'create' && readFieldTypegenState(field).create === 'required'
			compiled[fieldName] = {
				description: readGraphqlFieldDescription(field),
				type: required ? new GraphQLNonNull(type) : type,
			}
		}
		return compiled
	}

	#create(
		schema: SchemaDefinition,
		flat: boolean,
	): GraphQLInputObjectType | undefined {
		const cache = flat ? this.#flatCreates : this.#creates
		const existing = cache.get(schema)
		if (existing !== undefined) return existing
		const relationships = !flat
		const eligible = Object.values(schema.persistedFields).some(
			(field) =>
				this.#fieldAvailable(field, 'create', relationships) &&
				(!flat || (field.kind !== 'pointer' && field.kind !== 'relation')),
		)
		if (!eligible) return undefined
		const name = `${this.#surface(schema).typeName}${flat ? 'Flat' : ''}CreateInput`
		const input = this.#input(name, schema, undefined, () =>
			this.#fields(schema, 'create', relationships),
		)
		cache.set(schema, input)
		return input
	}

	#update(
		schema: SchemaDefinition,
		flat: boolean,
	): GraphQLInputObjectType | undefined {
		const cache = flat ? this.#flatUpdates : this.#updates
		const existing = cache.get(schema)
		if (existing !== undefined) return existing
		const relationships = !flat
		const mutable = Object.values(schema.persistedFields).some(
			(field) =>
				this.#fieldAvailable(field, 'update', relationships) &&
				(!flat || (field.kind !== 'pointer' && field.kind !== 'relation')),
		)
		if (!mutable) return undefined
		const name = `${this.#surface(schema).typeName}${flat ? 'Flat' : ''}UpdateInput`
		const input = this.#input(name, schema, undefined, () =>
			this.#fields(schema, 'update', relationships),
		)
		cache.set(schema, input)
		return input
	}

	createInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		return this.#create(schema, false)
	}

	flatCreateInput(
		schema: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		return this.#create(schema, true)
	}

	updateInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		return this.#update(schema, false)
	}

	flatUpdateInput(
		schema: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		return this.#update(schema, true)
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLInputObjectType) type.getFields()
		}
	}
}
