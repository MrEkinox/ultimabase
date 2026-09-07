import {
	getFieldListDepth,
	type GenericField,
	type SchemaDefinition,
	type SchemaFields,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLInputFieldConfigMap,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
} from 'graphql'

import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlFilterSharedTypes } from './filter-shared-types.js'
import { graphqlFieldTypeSegment } from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import { GraphqlJSON } from './scalars.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

/** Compiles recursive JSON paths and embedded-object partial inputs. */
export class GraphqlStructuralFilterInputCompiler {
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #names: GraphqlNameRegistry
	readonly #shared: GraphqlFilterSharedTypes
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #pathFilters = new Map<string, GraphQLInputObjectType>()
	readonly #partialObjects = new Map<string, GraphQLInputObjectType>()
	readonly #types: GraphQLNamedType[] = []

	constructor(
		options: Readonly<{
			readonly fieldTypes: GraphqlFieldTypeCompiler
			readonly names: GraphqlNameRegistry
			readonly shared: GraphqlFilterSharedTypes
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#fieldTypes = options.fieldTypes
		this.#names = options.names
		this.#shared = options.shared
		this.#surfaces = options.surfaces
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#types
	}

	#pathName(schema: SchemaDefinition, path: readonly string[]): string {
		const surface = this.#surfaces.get(schema)
		if (surface === undefined)
			throw new TypeError('GraphQL schema surface is unavailable')
		return `${surface.typeName}${path.map(graphqlFieldTypeSegment).join('')}`
	}

	#claim(
		name: string,
		schema: SchemaDefinition,
		path: readonly string[],
	): void {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema, path),
			owner: schema.definition.provenance.schema.owner,
		})
	}

	#list(
		type: GraphQLNullableInputType,
	): GraphQLList<GraphQLNonNull<GraphQLNullableInputType>> {
		return new GraphQLList(new GraphQLNonNull(type))
	}

	pathFilter(
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const key = `${schema.className}\0${path.join('\0')}\0path`
		const existing = this.#pathFilters.get(key)
		if (existing !== undefined) return existing
		const name = `${this.#pathName(schema, path)}PathWhere`
		this.#claim(name, schema, path)
		const fields: GraphQLInputFieldConfigMap = {
			path: { type: new GraphQLNonNull(this.#list(GraphQLString)) },
			eq: { type: GraphqlJSON },
			ne: { type: GraphqlJSON },
			in: { type: this.#list(GraphqlJSON) },
			notIn: { type: this.#list(GraphqlJSON) },
			gt: { type: GraphqlJSON },
			gte: { type: GraphqlJSON },
			lt: { type: GraphqlJSON },
			lte: { type: GraphqlJSON },
			between: { type: GraphqlJSON },
			notBetween: { type: GraphqlJSON },
			has: { type: GraphqlJSON },
			hasEvery: { type: this.#list(GraphqlJSON) },
			hasSome: { type: this.#list(GraphqlJSON) },
			isEmpty: { type: GraphQLBoolean },
			contains: { type: GraphqlJSON },
			startsWith: { type: GraphQLString },
			endsWith: { type: GraphQLString },
			matches: { type: this.#shared.regex() },
			isNull: { type: GraphQLBoolean },
			isNotNull: { type: GraphQLBoolean },
			containedBy: { type: GraphqlJSON },
			hasAllKeys: { type: this.#list(GraphQLString) },
			hasAnyKeys: { type: this.#list(GraphQLString) },
			hasKey: { type: GraphQLString },
			jsonPathExists: { type: this.#shared.jsonPath() },
			jsonPathMatches: { type: this.#shared.jsonPath() },
		}
		const result = new GraphQLInputObjectType({ name, fields })
		this.#pathFilters.set(key, result)
		this.#types.push(result)
		return result
	}

	partialObject(
		schema: SchemaDefinition,
		field: GenericField,
		path: readonly string[],
	): GraphQLInputObjectType {
		const key = `${schema.className}\0${path.join('\0')}`
		const existing = this.#partialObjects.get(key)
		if (existing !== undefined) return existing
		const name = `${this.#pathName(schema, path)}PartialInput`
		this.#claim(name, schema, path)
		const fields = 'fields' in field.options ? field.options.fields : undefined
		if (
			typeof fields !== 'object' ||
			fields === null ||
			Array.isArray(fields)
		) {
			throw new TypeError(
				`Missing object fields for ${schema.className}.${path.join('.')}`,
			)
		}
		const result = new GraphQLInputObjectType({
			name,
			fields: () =>
				Object.fromEntries(
					Object.entries(fields as SchemaFields).map(([childName, child]) => {
						const childPath = [...path, childName]
						const type =
							child.kind === 'object' && getFieldListDepth(child.options) === 0
								? this.partialObject(schema, child, childPath)
								: this.#fieldTypes.inputType(child, schema, childPath)
						return [childName, { type }]
					}),
				),
		})
		this.#partialObjects.set(key, result)
		this.#types.push(result)
		return result
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLInputObjectType) type.getFields()
		}
	}
}
