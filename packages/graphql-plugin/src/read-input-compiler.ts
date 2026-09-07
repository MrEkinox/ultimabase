import type { SchemaDefinition } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
} from 'graphql'
import type {
	GraphQLFieldConfigArgumentMap,
	GraphQLFieldConfigMap,
	GraphQLNamedType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import { assertGraphqlFieldName } from './names.js'
import { GraphqlSafeInt } from './scalars.js'
import type { GraphqlSchemaSurface } from './surfaces.js'

/** Generates read roots and their schema-aware argument declarations. */
export class GraphqlReadInputCompiler {
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #filters: GraphqlFilterInputCompiler
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>

	constructor(
		options: Readonly<{
			readonly fields: GraphqlFieldTypeCompiler
			readonly filters: GraphqlFilterInputCompiler
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#fields = options.fields
		this.#filters = options.filters
		this.#surfaces = options.surfaces
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#filters.types
	}

	#orderList(
		schema: SchemaDefinition,
	): GraphQLList<
		GraphQLNonNull<ReturnType<GraphqlFilterInputCompiler['order']>>
	> {
		return new GraphQLList(new GraphQLNonNull(this.#filters.order(schema)))
	}

	collectionArguments(schema: SchemaDefinition): GraphQLFieldConfigArgumentMap {
		return {
			after: { type: GraphQLString },
			first: { type: GraphQLInt },
			orderBy: { type: this.#orderList(schema) },
			where: { type: this.#filters.where(schema) },
		}
	}

	#root(
		fields: GraphQLFieldConfigMap<unknown, unknown>,
		surface: GraphqlSchemaSurface,
		operation: 'count' | 'exists' | 'findMany' | 'findOne' | 'get',
		config: GraphQLFieldConfigMap<unknown, unknown>[string],
	): void {
		if (!surface[operation]) return
		const fieldName = `${operation}${surface.typeName}`
		assertGraphqlFieldName(
			fieldName,
			`generated ${operation} operation for ${surface.schema.className}`,
			surface.owner,
		)
		fields[fieldName] = config
	}

	queryFields(): GraphQLFieldConfigMap<unknown, unknown> {
		const fields: GraphQLFieldConfigMap<unknown, unknown> = {}
		for (const surface of this.#surfaces.values()) {
			const schema = surface.schema
			const where = { where: { type: this.#filters.where(schema) } }
			this.#root(fields, surface, 'get', {
				args: { id: { type: new GraphQLNonNull(GraphQLID) } },
				type: this.#fields.model(schema),
			})
			this.#root(fields, surface, 'findOne', {
				args: {
					orderBy: { type: this.#orderList(schema) },
					...where,
				},
				type: this.#fields.model(schema),
			})
			this.#root(fields, surface, 'findMany', {
				args: this.collectionArguments(schema),
				type: new GraphQLNonNull(this.#fields.connectionType(schema)),
			})
			this.#root(fields, surface, 'count', {
				args: where,
				type: new GraphQLNonNull(GraphqlSafeInt),
			})
			this.#root(fields, surface, 'exists', {
				args: where,
				type: new GraphQLNonNull(GraphQLBoolean),
			})
		}
		if (Object.keys(fields).length === 0) {
			throw new GraphqlSchemaCompilationError(
				'missing-query-root',
				'GraphQL schema compilation requires at least one public query field',
			)
		}
		return fields
	}

	materialize(): void {
		this.#filters.materialize()
	}
}
