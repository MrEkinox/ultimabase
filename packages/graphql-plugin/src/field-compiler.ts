import {
	readFieldTypegenState,
	type CompiledSchemaRegistry,
	type GenericField,
	type SchemaDeclaredFields,
	type SchemaDefinition,
	type SchemaFields,
} from '@ultimabase/core'
import {
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLNonNull,
	GraphQLObjectType,
	type GraphQLFieldConfigMap,
	type GraphQLFieldConfigArgumentMap,
	type GraphQLInputFieldConfigMap,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlConnectionTypeCompiler } from './connection-types.js'
import {
	encodeGraphqlPluginFieldValue,
	readGraphqlPluginFieldCodec,
} from './field-codecs.js'
import { GraphqlOutputTypeCompiler } from './output-type-compiler.js'
import {
	readGraphqlEnumValues,
	readGraphqlFieldDescription,
	readGraphqlFieldOwner,
	readGraphqlObjectFields,
} from './field-metadata.js'
import {
	assertGraphqlFieldName,
	graphqlEnumValueName,
	graphqlFieldTypeSegment,
} from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import { GraphqlJSON } from './scalars.js'
import {
	readGraphqlScalarInputType,
	readGraphqlScalarOutputType,
	wrapGraphqlFieldList,
} from './scalar-types.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

type GraphqlRelationArguments = (
	target: SchemaDefinition,
) => GraphQLFieldConfigArgumentMap

/** Compiles schema fields into reusable application-local GraphQL named types. */
export class GraphqlFieldTypeCompiler {
	readonly #schemas: CompiledSchemaRegistry
	readonly #names: GraphqlNameRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #relationArguments: GraphqlRelationArguments
	readonly #relationResolver: GraphqlGeneratedExecution['relation']
	readonly #models = new Map<SchemaDefinition, GraphQLObjectType>()
	readonly #connectionTypes: GraphqlConnectionTypeCompiler
	readonly #outputTypes: GraphqlOutputTypeCompiler
	readonly #enums = new Map<string, GraphQLEnumType>()
	readonly #embeddedInputs = new Map<string, GraphQLInputObjectType>()
	readonly #embeddedOutputs = new Map<string, GraphQLObjectType>()
	readonly #namedTypes: GraphQLNamedType[] = []

	constructor(
		options: Readonly<{
			readonly names: GraphqlNameRegistry
			readonly schemas: CompiledSchemaRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
			readonly relationArguments: GraphqlRelationArguments
			readonly relationResolver: GraphqlGeneratedExecution['relation']
		}>,
	) {
		this.#names = options.names
		this.#schemas = options.schemas
		this.#surfaces = options.surfaces
		this.#relationArguments = options.relationArguments
		this.#relationResolver = options.relationResolver
		this.#connectionTypes = new GraphqlConnectionTypeCompiler({
			model: (schema) => this.model(schema),
			names: options.names,
			surfaces: options.surfaces,
		})
		this.#outputTypes = new GraphqlOutputTypeCompiler(options.names)
	}
	get types(): readonly GraphQLNamedType[] {
		return [
			...this.#namedTypes,
			...this.#connectionTypes.types,
			...this.#outputTypes.types,
		]
	}

	connectionType(schema: SchemaDefinition): GraphQLObjectType {
		return this.#connectionTypes.connection(schema)
	}
	#surface(schema: SchemaDefinition): GraphqlSchemaSurface {
		const surface = this.#surfaces.get(schema)
		if (surface === undefined) {
			throw new TypeError('GraphQL schema surface is unavailable')
		}
		return surface
	}

	#claimGenerated(
		name: string,
		schema: SchemaDefinition,
		path?: readonly string[],
	): void {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema, path),
			owner: schema.definition.provenance.schema.owner,
		})
	}

	model(schema: SchemaDefinition): GraphQLObjectType {
		const existing = this.#models.get(schema)
		if (existing !== undefined) return existing
		const model = new GraphQLObjectType({
			name: this.#surface(schema).typeName,
			fields: () => this.#outputFields(schema, schema.definition.fields, []),
		})
		this.#models.set(schema, model)
		this.#namedTypes.push(model)
		return model
	}
	#outputFields(
		schema: SchemaDefinition,
		fields: SchemaDeclaredFields,
		parentPath: readonly string[],
	): GraphQLFieldConfigMap<unknown, unknown> {
		const compiled: GraphQLFieldConfigMap<unknown, unknown> = {}
		for (const [name, field] of Object.entries(fields)) {
			const path = [...parentPath, name]
			assertGraphqlFieldName(
				name,
				graphqlSourceDescription(schema, path),
				readGraphqlFieldOwner(schema, path),
			)
			if (field.kind === 'virtual') {
				const virtual = schema.virtualFields[name]
				if (virtual === undefined) {
					throw new TypeError('Compiled virtual field metadata is unavailable')
				}
				compiled[name] = {
					description: readGraphqlFieldDescription(virtual),
					type: this.#outputTypes.output(
						virtual.output,
						schema,
						path,
						this.#surface(schema).typeName,
					),
				}
				continue
			}
			const stored =
				parentPath.length === 0 ? schema.persistedFields[name] : field
			if (stored === undefined) {
				throw new TypeError('Compiled persisted field metadata is unavailable')
			}
			const codec = readGraphqlPluginFieldCodec(stored, schema, path)
			const target =
				stored.kind === 'relation' ? this.#target(schema, path) : undefined
			compiled[name] = {
				description: readGraphqlFieldDescription(stored),
				type: this.#outputType(stored, schema, path),
				...(target === undefined
					? {}
					: {
							args: this.#relationArguments(target),
							resolve: this.#relationResolver(
								schema,
								name,
								target,
								this.#surface(target).typeName,
							),
						}),
				...(codec === undefined
					? {}
					: {
							resolve: (source: unknown) =>
								encodeGraphqlPluginFieldValue(source, name, stored, codec),
						}),
			}
		}
		return compiled
	}
	#fieldPathKey(schema: SchemaDefinition, path: readonly string[]): string {
		return `${schema.className}\0${path.join('\0')}`
	}

	#outputType(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLNullableOutputType {
		return wrapGraphqlFieldList(this.#outputScalar(field, schema, path), field)
	}
	#outputScalar(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLNullableOutputType {
		const scalar = readGraphqlScalarOutputType(
			field,
			path.length === 1 && path[0] === 'id',
		)
		if (scalar !== undefined) return scalar
		switch (field.kind) {
			case 'enum':
				return this.#enum(field, schema, path)
			case 'object':
				return this.#embeddedOutput(field, schema, path)
			case 'pointer':
				return this.model(this.#target(schema, path))
			case 'relation':
				return this.#connectionTypes.connection(this.#target(schema, path))
			default:
				readGraphqlPluginFieldCodec(field, schema, path)
				return GraphqlJSON
		}
	}
	inputElementType(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLNullableInputType {
		const scalar = readGraphqlScalarInputType(field)
		if (scalar !== undefined) return scalar
		switch (field.kind) {
			case 'enum':
				return this.#enum(field, schema, path)
			case 'object':
				return this.#embeddedInput(field, schema, path)
			default:
				readGraphqlPluginFieldCodec(field, schema, path)
				return GraphqlJSON
		}
	}
	inputType(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLNullableInputType {
		return wrapGraphqlFieldList(
			this.inputElementType(field, schema, path),
			field,
		)
	}
	#enum(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLEnumType {
		const pathKey = this.#fieldPathKey(schema, path)
		const existing = this.#enums.get(pathKey)
		if (existing !== undefined) return existing
		const explicit =
			'typeName' in field.options ? field.options.typeName : undefined
		const name =
			typeof explicit === 'string'
				? explicit
				: `${this.#surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}`
		this.#claimGenerated(name, schema, path)
		const values: Record<string, { readonly value: string }> = {}
		for (const value of readGraphqlEnumValues(field)) {
			const enumName = graphqlEnumValueName(value)
			if (Object.hasOwn(values, enumName)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL enum value "${enumName}" collides in ${schema.className}.${path.join('.')}`,
					{
						owner: readGraphqlFieldOwner(schema, path),
						path: `${name}.${enumName}`,
					},
				)
			}
			values[enumName] = { value }
		}
		const result = new GraphQLEnumType({ name, values })
		this.#enums.set(pathKey, result)
		this.#namedTypes.push(result)
		return result
	}
	#embeddedName(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): string {
		const explicit =
			'typeName' in field.options ? field.options.typeName : undefined
		return typeof explicit === 'string'
			? explicit
			: `${this.#surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}`
	}

	#embeddedOutput(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLObjectType {
		const pathKey = this.#fieldPathKey(schema, path)
		const existing = this.#embeddedOutputs.get(pathKey)
		if (existing !== undefined) return existing
		const name = this.#embeddedName(field, schema, path)
		this.#claimGenerated(name, schema, path)
		const result = new GraphQLObjectType({
			name,
			fields: () =>
				this.#outputFields(schema, readGraphqlObjectFields(field), path),
		})
		this.#embeddedOutputs.set(pathKey, result)
		this.#namedTypes.push(result)
		return result
	}

	#embeddedInput(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const pathKey = this.#fieldPathKey(schema, path)
		const existing = this.#embeddedInputs.get(pathKey)
		if (existing !== undefined) return existing
		const name = `${this.#embeddedName(field, schema, path)}Input`
		this.#claimGenerated(name, schema, path)
		const result = new GraphQLInputObjectType({
			name,
			fields: () =>
				this.createFields(schema, readGraphqlObjectFields(field), path),
		})
		this.#embeddedInputs.set(pathKey, result)
		this.#namedTypes.push(result)
		return result
	}

	#target(schema: SchemaDefinition, path: readonly string[]): SchemaDefinition {
		const target = this.#schemas.schemaTargets.get(schema, path)
		if (target === undefined) {
			throw new TypeError(
				`Missing compiled target for ${schema.className}.${path.join('.')}`,
			)
		}
		return target
	}

	createFields(
		schema: SchemaDefinition,
		fields: SchemaFields,
		parentPath: readonly string[],
	): GraphQLInputFieldConfigMap {
		const compiled: GraphQLInputFieldConfigMap = {}
		for (const [name, field] of Object.entries(fields)) {
			const state = readFieldTypegenState(field)
			if (state.create === 'forbidden') continue
			const path = [...parentPath, name]
			assertGraphqlFieldName(
				name,
				graphqlSourceDescription(schema, path),
				readGraphqlFieldOwner(schema, path),
			)
			const nullableType = this.inputType(field, schema, path)
			compiled[name] = {
				description: readGraphqlFieldDescription(field),
				type:
					state.create === 'required'
						? new GraphQLNonNull(nullableType)
						: nullableType,
			}
		}
		return compiled
	}

	/** Forces every thunk once so final schema construction observes a fixed set. */
	materialize(): void {
		this.#connectionTypes.materialize()
		for (const type of this.#namedTypes) {
			if (
				type instanceof GraphQLObjectType ||
				type instanceof GraphQLInputObjectType
			) {
				type.getFields()
			}
		}
	}
}
