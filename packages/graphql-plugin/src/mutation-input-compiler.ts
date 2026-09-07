import {
	getFieldListDepth,
	readFieldTypegenState,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import { GraphQLInputObjectType, type GraphQLNamedType } from 'graphql'

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

/** Generates create and update input objects separately from output field types. */
export class GraphqlMutationInputCompiler {
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #names: GraphqlNameRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #creates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #updates = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #types: GraphQLNamedType[] = []

	constructor(
		options: Readonly<{
			readonly fieldTypes: GraphqlFieldTypeCompiler
			readonly names: GraphqlNameRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#fieldTypes = options.fieldTypes
		this.#names = options.names
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

	#claim(
		name: string,
		schema: SchemaDefinition,
		path?: readonly string[],
	): void {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema, path),
			owner: schema.definition.provenance.schema.owner,
		})
	}

	createInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		const eligible = Object.values(schema.definition.fields).some(
			(field) => readFieldTypegenState(field).create !== 'forbidden',
		)
		if (!eligible) return undefined
		const existing = this.#creates.get(schema)
		if (existing !== undefined) return existing
		const name = `${this.#surface(schema).typeName}CreateInput`
		this.#claim(name, schema)
		const input = new GraphQLInputObjectType({
			name,
			fields: () =>
				this.#fieldTypes.createFields(schema, schema.definition.fields, []),
		})
		this.#creates.set(schema, input)
		this.#types.push(input)
		return input
	}

	#updateWrapper(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const name = `${this.#surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}Update`
		this.#claim(name, schema, path)
		const valueType = this.#fieldTypes.inputType(field, schema, path)
		const numeric =
			getFieldListDepth(field.options) === 0 &&
			['bigint', 'decimal', 'float', 'int'].includes(field.kind)
		const wrapper = new GraphQLInputObjectType({
			name,
			fields: {
				set: { type: valueType },
				...(numeric
					? { increment: { type: valueType }, decrement: { type: valueType } }
					: {}),
			},
		})
		this.#types.push(wrapper)
		return wrapper
	}

	updateInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		const mutable = Object.entries(schema.definition.fields).filter(
			([, field]) => readFieldTypegenState(field).update !== 'forbidden',
		)
		if (mutable.length === 0) return undefined
		const existing = this.#updates.get(schema)
		if (existing !== undefined) return existing
		const name = `${this.#surface(schema).typeName}UpdateInput`
		this.#claim(name, schema)
		const input = new GraphQLInputObjectType({
			name,
			fields: () =>
				Object.fromEntries(
					mutable.map(([fieldName, field]) => {
						const path = [fieldName]
						assertGraphqlFieldName(
							fieldName,
							graphqlSourceDescription(schema, path),
							readGraphqlFieldOwner(schema, path),
						)
						return [
							fieldName,
							{
								description: readGraphqlFieldDescription(field),
								type: this.#updateWrapper(field, schema, path),
							},
						]
					}),
				),
		})
		this.#updates.set(schema, input)
		this.#types.push(input)
		return input
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLInputObjectType) type.getFields()
		}
	}
}
