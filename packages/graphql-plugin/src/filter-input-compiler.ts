import {
	getFieldListDepth,
	getPluginFieldStorageCodec,
	getPluginFieldStructuralContains,
	type CompiledSchemaRegistry,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLInputFieldConfigMap,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
} from 'graphql'

import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import { GraphqlCompiledSchemaLookup } from './compiled-schema-lookup.js'
import {
	graphqlEqualityFieldKinds,
	graphqlOrderedFieldKinds,
} from './filter-capabilities.js'
import { GraphqlFilterSharedTypes } from './filter-shared-types.js'
import { GraphqlStructuralFilterInputCompiler } from './filter-structural-input-compiler.js'
import {
	isGraphqlBuiltInFieldKind,
	readGraphqlFieldOwner,
} from './field-metadata.js'
import { assertGraphqlFieldName, graphqlFieldTypeSegment } from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import { GraphqlJSON } from './scalars.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

/** Generates schema-aware GraphQL filter and ordering input objects. */
export class GraphqlFilterInputCompiler {
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #compiled: GraphqlCompiledSchemaLookup
	readonly #names: GraphqlNameRegistry
	readonly #types: GraphQLNamedType[] = []
	readonly #whereTypes = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #fieldFilters = new Map<string, GraphQLInputObjectType>()
	readonly #orders = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #shared: GraphqlFilterSharedTypes
	readonly #structural: GraphqlStructuralFilterInputCompiler

	constructor(
		options: Readonly<{
			readonly fieldTypes: GraphqlFieldTypeCompiler
			readonly names: GraphqlNameRegistry
			readonly schemas: CompiledSchemaRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#fieldTypes = options.fieldTypes
		this.#compiled = new GraphqlCompiledSchemaLookup(
			options.schemas,
			options.surfaces,
		)
		this.#names = options.names
		this.#shared = new GraphqlFilterSharedTypes(options.names)
		this.#structural = new GraphqlStructuralFilterInputCompiler({
			compiled: this.#compiled,
			fieldTypes: options.fieldTypes,
			names: options.names,
			shared: this.#shared,
		})
	}

	get types(): readonly GraphQLNamedType[] {
		return [...this.#types, ...this.#shared.types, ...this.#structural.types]
	}

	#claim(
		name: string,
		schema?: SchemaDefinition,
		path?: readonly string[],
	): void {
		this.#names.claimType(name, {
			description:
				schema === undefined
					? `shared GraphQL read input ${name}`
					: graphqlSourceDescription(schema, path),
			...(schema === undefined
				? {}
				: { owner: schema.definition.provenance.schema.owner }),
		})
	}

	#pathName(schema: SchemaDefinition, path: readonly string[]): string {
		return `${this.#compiled.surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}`
	}

	#valueType(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLNullableInputType {
		return path.length === 1 && path[0] === 'id'
			? GraphQLID
			: this.#fieldTypes.inputElementType(field, schema, path)
	}

	#list(
		type: GraphQLNullableInputType,
	): GraphQLList<GraphQLNonNull<GraphQLNullableInputType>> {
		return new GraphQLList(new GraphQLNonNull(type))
	}

	#range(
		name: string,
		type: GraphQLNullableInputType,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const rangeName = `${name}Range`
		this.#claim(rangeName, schema, path)
		const range = new GraphQLInputObjectType({
			name: rangeName,
			fields: {
				lower: { type: new GraphQLNonNull(type) },
				upper: { type: new GraphQLNonNull(type) },
			},
		})
		this.#types.push(range)
		return range
	}

	#addNullOperators(fields: GraphQLInputFieldConfigMap): void {
		fields.isNull = { type: GraphQLBoolean }
		fields.isNotNull = { type: GraphQLBoolean }
	}

	#addEqualityOperators(
		fields: GraphQLInputFieldConfigMap,
		type: GraphQLNullableInputType,
	): void {
		fields.eq = { type }
		fields.in = { type: this.#list(type) }
		fields.ne = { type }
		fields.notIn = { type: this.#list(type) }
	}

	#addStructuralOperators(fields: GraphQLInputFieldConfigMap): void {
		fields.containedBy = { type: GraphqlJSON }
		fields.contains = { type: GraphqlJSON }
		fields.hasAllKeys = { type: this.#list(GraphQLString) }
		fields.hasAnyKeys = { type: this.#list(GraphQLString) }
		fields.hasKey = { type: GraphQLString }
		fields.jsonPathExists = { type: this.#shared.jsonPath() }
		fields.jsonPathMatches = { type: this.#shared.jsonPath() }
	}

	#relationCount(
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const name = `${this.#pathName(schema, path)}CountWhere`
		this.#claim(name, schema, path)
		const range = this.#range(name, GraphQLInt, schema, path)
		const target = this.#compiled.target(schema, path)
		const result: GraphQLInputObjectType = new GraphQLInputObjectType({
			name,
			fields: () => ({
				between: { type: range },
				eq: { type: GraphQLInt },
				gt: { type: GraphQLInt },
				gte: { type: GraphQLInt },
				in: { type: this.#list(GraphQLInt) },
				lt: { type: GraphQLInt },
				lte: { type: GraphQLInt },
				ne: { type: GraphQLInt },
				notBetween: { type: range },
				notIn: { type: this.#list(GraphQLInt) },
				where: { type: this.where(target) },
			}),
		})
		this.#types.push(result)
		return result
	}

	#fieldFilter(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const key = `${schema.className}\0${path.join('\0')}\0field`
		const existing = this.#fieldFilters.get(key)
		if (existing !== undefined) return existing
		const name = `${this.#pathName(schema, path)}Where`
		this.#claim(name, schema, path)
		const result = new GraphQLInputObjectType({
			name,
			fields: () => this.#fieldFilterFields(field, schema, path, name),
		})
		this.#fieldFilters.set(key, result)
		this.#types.push(result)
		return result
	}

	#fieldFilterFields(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
		name: string,
	): GraphQLInputFieldConfigMap {
		if (field.kind === 'pointer') {
			const fields: GraphQLInputFieldConfigMap = {
				is: { type: this.where(this.#compiled.target(schema, path)) },
				isNot: { type: this.where(this.#compiled.target(schema, path)) },
			}
			this.#addEqualityOperators(fields, GraphQLID)
			this.#addNullOperators(fields)
			return fields
		}
		if (field.kind === 'relation') {
			const targetWhere = this.where(this.#compiled.target(schema, path))
			return {
				count: { type: this.#relationCount(schema, path) },
				every: { type: targetWhere },
				isEmpty: { type: GraphQLBoolean },
				isNotEmpty: { type: GraphQLBoolean },
				none: { type: targetWhere },
				some: { type: targetWhere },
			}
		}
		const fields: GraphQLInputFieldConfigMap = {}
		const valueType = this.#valueType(field, schema, path)
		if (getFieldListDepth(field.options) > 0) {
			const listType = this.#list(valueType)
			fields.eq = { type: listType }
			fields.ne = { type: listType }
			fields.has = { type: valueType }
			fields.hasEvery = { type: listType }
			fields.hasSome = { type: listType }
			fields.isEmpty = { type: GraphQLBoolean }
			this.#addNullOperators(fields)
			return fields
		}
		if (
			graphqlEqualityFieldKinds.has(field.kind) ||
			getPluginFieldStorageCodec(field) !== undefined
		) {
			this.#addEqualityOperators(fields, valueType)
		}
		if (graphqlOrderedFieldKinds.has(field.kind)) {
			const range = this.#range(name, valueType, schema, path)
			fields.between = { type: range }
			fields.gt = { type: valueType }
			fields.gte = { type: valueType }
			fields.lt = { type: valueType }
			fields.lte = { type: valueType }
			fields.notBetween = { type: range }
		}
		if (field.kind === 'string') {
			fields.contains = { type: GraphQLString }
			fields.endsWith = { type: GraphQLString }
			fields.matches = { type: this.#shared.regex() }
			fields.startsWith = { type: GraphQLString }
		}
		if (field.kind === 'json' || field.kind === 'object') {
			this.#addStructuralOperators(fields)
			fields.at = {
				type: this.#list(this.#structural.pathFilter(schema, path)),
			}
			if (field.kind === 'object') {
				const partial = this.#structural.partialObject(schema, field, path)
				fields.containedBy = { type: partial }
				fields.contains = { type: partial }
			}
		} else if (
			!isGraphqlBuiltInFieldKind(field.kind) &&
			getPluginFieldStructuralContains(field) !== undefined
		) {
			fields.contains = { type: GraphqlJSON }
		}
		this.#addNullOperators(fields)
		return fields
	}

	where(schema: SchemaDefinition): GraphQLInputObjectType {
		const existing = this.#whereTypes.get(schema)
		if (existing !== undefined) return existing
		const name = `${this.#compiled.surface(schema).typeName}Where`
		this.#claim(name, schema)
		const result: GraphQLInputObjectType = new GraphQLInputObjectType({
			name,
			fields: () => ({
				AND: { type: this.#list(result) },
				OR: { type: this.#list(result) },
				NOT: { type: result },
				...Object.fromEntries(
					Object.entries(schema.persistedFields).map(([fieldName, field]) => {
						assertGraphqlFieldName(
							fieldName,
							graphqlSourceDescription(schema, [fieldName]),
							readGraphqlFieldOwner(schema, [fieldName]),
						)
						return [
							fieldName,
							{ type: this.#fieldFilter(field, schema, [fieldName]) },
						]
					}),
				),
			}),
		})
		this.#whereTypes.set(schema, result)
		this.#types.push(result)
		return result
	}

	order(schema: SchemaDefinition): GraphQLInputObjectType {
		const existing = this.#orders.get(schema)
		if (existing !== undefined) return existing
		const typeName = this.#compiled.surface(schema).typeName
		const enumName = `${typeName}OrderField`
		this.#claim(enumName, schema)
		const field = new GraphQLEnumType({
			name: enumName,
			values: Object.fromEntries(
				Object.keys(schema.persistedFields).map((name) => [
					name,
					{ value: name },
				]),
			),
		})
		this.#types.push(field)
		const name = `${typeName}Order`
		this.#claim(name, schema)
		const result = new GraphQLInputObjectType({
			name,
			fields: {
				direction: { type: new GraphQLNonNull(this.#shared.direction()) },
				field: { type: new GraphQLNonNull(field) },
			},
		})
		this.#orders.set(schema, result)
		this.#types.push(result)
		return result
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLInputObjectType) type.getFields()
		}
		this.#structural.materialize()
	}
}
