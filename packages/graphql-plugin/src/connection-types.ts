import type { SchemaDefinition } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
	type GraphQLNamedType,
} from 'graphql'

import type { GraphqlNameRegistry } from './names.js'
import {
	graphqlSourceDescription,
	type GraphqlSchemaSurface,
} from './surfaces.js'

/** Builds inert Relay-shaped types while issue 611 remains cursor behavior owner. */
export class GraphqlConnectionTypeCompiler {
	readonly #model: (schema: SchemaDefinition) => GraphQLObjectType
	readonly #names: GraphqlNameRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #connections = new Map<SchemaDefinition, GraphQLObjectType>()
	readonly #edges = new Map<SchemaDefinition, GraphQLObjectType>()
	readonly #types: GraphQLNamedType[] = []
	#pageInfo: GraphQLObjectType | undefined

	constructor(
		options: Readonly<{
			readonly model: (schema: SchemaDefinition) => GraphQLObjectType
			readonly names: GraphqlNameRegistry
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#model = options.model
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

	#claim(name: string, schema: SchemaDefinition): void {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema),
			owner: schema.definition.provenance.schema.owner,
		})
	}

	#pageInfoType(): GraphQLObjectType {
		if (this.#pageInfo !== undefined) return this.#pageInfo
		this.#names.claimType('PageInfo', {
			description: 'reserved Relay page information',
		})
		this.#pageInfo = new GraphQLObjectType({
			name: 'PageInfo',
			fields: {
				hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
				hasPreviousPage: { type: new GraphQLNonNull(GraphQLBoolean) },
				startCursor: { type: GraphQLString },
				endCursor: { type: GraphQLString },
			},
		})
		this.#types.push(this.#pageInfo)
		return this.#pageInfo
	}

	#edge(schema: SchemaDefinition): GraphQLObjectType {
		const existing = this.#edges.get(schema)
		if (existing !== undefined) return existing
		const name = `${this.#surface(schema).typeName}Edge`
		this.#claim(name, schema)
		const edge = new GraphQLObjectType({
			name,
			fields: () => ({
				cursor: { type: new GraphQLNonNull(GraphQLString) },
				node: { type: new GraphQLNonNull(this.#model(schema)) },
			}),
		})
		this.#edges.set(schema, edge)
		this.#types.push(edge)
		return edge
	}

	connection(schema: SchemaDefinition): GraphQLObjectType {
		const existing = this.#connections.get(schema)
		if (existing !== undefined) return existing
		const name = `${this.#surface(schema).typeName}Connection`
		this.#claim(name, schema)
		const connection = new GraphQLObjectType({
			name,
			fields: () => ({
				edges: {
					type: new GraphQLNonNull(
						new GraphQLList(new GraphQLNonNull(this.#edge(schema))),
					),
				},
				nodes: {
					type: new GraphQLNonNull(
						new GraphQLList(new GraphQLNonNull(this.#model(schema))),
					),
				},
				pageInfo: { type: new GraphQLNonNull(this.#pageInfoType()) },
			}),
		})
		this.#connections.set(schema, connection)
		this.#types.push(connection)
		return connection
	}

	materialize(): void {
		for (const type of this.#types) {
			if (type instanceof GraphQLObjectType) type.getFields()
		}
	}
}
