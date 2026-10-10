import {
	getFieldListDepth,
	getPluginFieldWireCodec,
	readFieldTypegenState,
	type GenericField,
	type PluginFieldWireCodec,
	type SchemaDeclaredFields,
	type SchemaDefinition,
	type SchemaFields,
} from '@ultimabase/core'
import {
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLNonNull,
	GraphQLObjectType,
	type GraphQLFieldConfig,
	type GraphQLFieldConfigArgumentMap,
	type GraphQLFieldConfigMap,
	type GraphQLInputFieldConfigMap,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
} from 'graphql'

import {
	assertSchemaFieldName,
	fieldPathKey,
	graphqlEnumValueName,
	readGraphqlSharedEnum,
	graphqlFieldOwner,
	memoize,
	readGraphqlEnumValues,
	readGraphqlDescription,
	readGraphqlObjectFields,
	type GraphqlCompileContext,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlOutputTypeCompiler } from './output-type-compiler.js'
import { graphqlFieldProtocol } from './protocol.js'
import { GraphqlJSON } from './scalars.js'
import {
	isGraphqlBuiltInFieldKind,
	readGraphqlScalarInputType,
	readGraphqlScalarOutputType,
	wrapGraphqlFieldList,
} from './scalar-types.js'

/** Supplies the read arguments and resolver of generated relation fields. */
export interface GraphqlRelationFields {
	readonly arguments: (
		target: SchemaDefinition,
	) => GraphQLFieldConfigArgumentMap
	readonly resolver: GraphqlGeneratedExecution['relation']
}

/** Requires the GraphQL v1 wire codec of every plugin-owned field kind. */
const readGraphqlPluginFieldCodec = (
	field: GenericField,
	schema: SchemaDefinition,
	path: readonly string[],
): PluginFieldWireCodec | undefined => {
	if (isGraphqlBuiltInFieldKind(field.kind)) return undefined
	const codec = getPluginFieldWireCodec(field, graphqlFieldProtocol)
	if (codec === undefined) {
		throw new GraphqlSchemaCompilationError(
			'missing-field-codec',
			`Plugin field ${schema.className}.${path.join('.')} has no ultimabase.graphql.field@1.0.0 JSON codec`,
			{
				owner: graphqlFieldOwner(schema, path),
				path: `${schema.className}.${path.join('.')}`,
			},
		)
	}
	return codec
}

const encodePluginFieldValue = (
	source: unknown,
	name: string,
	field: GenericField,
	codec: PluginFieldWireCodec,
): unknown => {
	if (typeof source !== 'object' || source === null) return undefined
	const value: unknown = Reflect.get(source, name)
	if (value === null || value === undefined) return value
	if (getFieldListDepth(field.options) === 0) return codec.encode(value)
	return Array.isArray(value)
		? value.map((entry) => codec.encode(entry))
		: value
}

/** Compiles schema fields into reusable application-local GraphQL named types. */
export class GraphqlFieldTypeCompiler {
	readonly #ctx: GraphqlCompileContext
	readonly #relations: GraphqlRelationFields
	readonly #outputs: GraphqlOutputTypeCompiler
	readonly #models = new Map<SchemaDefinition, GraphQLObjectType>()
	readonly #enums = new Map<string, GraphQLEnumType>()
	readonly #objects = new Map<string, GraphQLObjectType>()
	readonly #inputs = new Map<string, GraphQLInputObjectType>()

	constructor(ctx: GraphqlCompileContext, relations: GraphqlRelationFields) {
		this.#ctx = ctx
		this.#relations = relations
		this.#outputs = new GraphqlOutputTypeCompiler(ctx, (schema) =>
			this.model(schema),
		)
	}

	model(schema: SchemaDefinition): GraphQLObjectType {
		return memoize(this.#models, schema, () =>
			this.#ctx.add(
				'models',
				new GraphQLObjectType({
					name: this.#ctx.surface(schema).typeName,
					fields: () =>
						this.#outputFields(schema, schema.definition.fields, []),
				}),
			),
		)
	}

	connectionType(schema: SchemaDefinition): GraphQLObjectType {
		return this.#outputs.connection(schema)
	}

	#outputFields(
		schema: SchemaDefinition,
		fields: SchemaDeclaredFields,
		parentPath: readonly string[],
	): GraphQLFieldConfigMap<unknown, unknown> {
		return Object.fromEntries(
			Object.entries(fields).map(([name, field]) => {
				const path = [...parentPath, name]
				assertSchemaFieldName(schema, path)
				return [name, this.#outputField(schema, name, field, path)]
			}),
		)
	}

	#outputField(
		schema: SchemaDefinition,
		name: string,
		field: SchemaDeclaredFields[string],
		path: readonly string[],
	): GraphQLFieldConfig<unknown, unknown> {
		if (field.kind === 'virtual') {
			const virtual = schema.virtualFields[name]
			if (virtual === undefined) {
				throw new TypeError('Compiled virtual field metadata is unavailable')
			}
			return {
				description: readGraphqlDescription(virtual),
				type: this.#outputs.output(
					virtual.output,
					schema,
					path,
					this.#ctx.surface(schema).typeName,
				),
			}
		}
		const stored = path.length === 1 ? schema.persistedFields[name] : field
		if (stored === undefined) {
			throw new TypeError('Compiled persisted field metadata is unavailable')
		}
		const codec = readGraphqlPluginFieldCodec(stored, schema, path)
		const target =
			stored.kind === 'relation' ? this.#ctx.target(schema, path) : undefined
		return {
			description: readGraphqlDescription(stored),
			type: wrapGraphqlFieldList(
				this.#outputType(stored, schema, path),
				stored,
			),
			...(target === undefined
				? {}
				: {
						args: this.#relations.arguments(target),
						resolve: this.#relations.resolver(
							schema,
							name,
							target,
							this.#ctx.surface(target).typeName,
						),
					}),
			...(codec === undefined
				? {}
				: {
						resolve: (source: unknown) =>
							encodePluginFieldValue(source, name, stored, codec),
					}),
		}
	}

	#outputType(
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
				return this.model(this.#ctx.target(schema, path))
			case 'relation':
				return this.#outputs.connection(this.#ctx.target(schema, path))
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

	#fieldTypeName(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): string {
		const explicit: unknown = Reflect.get(field.options, 'typeName')
		return typeof explicit === 'string'
			? explicit
			: this.#ctx.typeName(schema, path)
	}

	#enum(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLEnumType {
		const shared = readGraphqlSharedEnum(field.options)
		if (shared !== undefined) {
			// A shared enum names one GraphQL type for every field (ADR-0310).
			return this.#ctx.sharedEnum(
				shared.name,
				() => {
					this.#ctx.claim(shared.name, schema, path)
				},
				() => this.#createEnum(shared.name, field, schema, path),
			)
		}
		return memoize(this.#enums, fieldPathKey(schema, path), () => {
			const name = this.#ctx.typeName(schema, path)
			this.#ctx.claim(name, schema, path)
			return this.#ctx.add(
				'models',
				this.#createEnum(name, field, schema, path),
			)
		})
	}

	#createEnum(
		name: string,
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLEnumType {
		const values = new Map<string, { readonly value: string }>()
		for (const value of readGraphqlEnumValues(field.options)) {
			const enumName = graphqlEnumValueName(value)
			if (values.has(enumName)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL enum value "${enumName}" collides in ${schema.className}.${path.join('.')}`,
					{
						owner: graphqlFieldOwner(schema, path),
						path: `${name}.${enumName}`,
					},
				)
			}
			values.set(enumName, { value })
		}
		return new GraphQLEnumType({ name, values: Object.fromEntries(values) })
	}

	#embeddedOutput(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLObjectType {
		return memoize(this.#objects, fieldPathKey(schema, path), () => {
			const name = this.#fieldTypeName(field, schema, path)
			this.#ctx.claim(name, schema, path)
			return this.#ctx.add(
				'models',
				new GraphQLObjectType({
					name,
					fields: () =>
						this.#outputFields(schema, readGraphqlObjectFields(field), path),
				}),
			)
		})
	}

	#embeddedInput(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		return memoize(this.#inputs, fieldPathKey(schema, path), () => {
			const name = `${this.#fieldTypeName(field, schema, path)}Input`
			this.#ctx.claim(name, schema, path)
			return this.#ctx.add(
				'models',
				new GraphQLInputObjectType({
					name,
					fields: () =>
						this.#createFields(schema, readGraphqlObjectFields(field), path),
				}),
			)
		})
	}

	#createFields(
		schema: SchemaDefinition,
		fields: SchemaFields,
		parentPath: readonly string[],
	): GraphQLInputFieldConfigMap {
		const compiled: [string, GraphQLInputFieldConfigMap[string]][] = []
		for (const [name, field] of Object.entries(fields)) {
			const state = readFieldTypegenState(field)
			if (state.create === 'forbidden') continue
			const path = [...parentPath, name]
			assertSchemaFieldName(schema, path)
			const type = this.inputType(field, schema, path)
			compiled.push([
				name,
				{
					description: readGraphqlDescription(field),
					type: state.create === 'required' ? new GraphQLNonNull(type) : type,
				},
			])
		}
		return Object.fromEntries(compiled)
	}
}
