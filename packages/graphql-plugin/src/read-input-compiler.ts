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
} from 'graphql'

import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlFilterInputCompiler } from './filter-input-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { assertGraphqlFieldName } from './names.js'
import { GraphqlSafeInt } from './scalars.js'
import type { GraphqlSchemaSurface } from './surfaces.js'

/** Generates read roots and their schema-aware argument declarations. */
export class GraphqlReadInputCompiler {
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #filters: GraphqlFilterInputCompiler
	readonly #defaultPageSize: number
	readonly #execution: GraphqlGeneratedExecution
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>

	constructor(
		options: Readonly<{
			readonly defaultPageSize: number
			readonly fields: GraphqlFieldTypeCompiler
			readonly filters: GraphqlFilterInputCompiler
			readonly execution: GraphqlGeneratedExecution
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#defaultPageSize = options.defaultPageSize
		this.#execution = options.execution
		this.#fields = options.fields
		this.#filters = options.filters
		this.#surfaces = options.surfaces
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
			first: { default: { value: this.#defaultPageSize }, type: GraphQLInt },
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
				resolve: this.#execution.read(schema, 'get'),
				type: this.#fields.model(schema),
			})
			this.#root(fields, surface, 'findOne', {
				args: {
					orderBy: { type: this.#orderList(schema) },
					...where,
				},
				resolve: this.#execution.read(schema, 'findOne'),
				type: this.#fields.model(schema),
			})
			this.#root(fields, surface, 'findMany', {
				args: this.collectionArguments(schema),
				resolve: this.#execution.read(schema, 'findMany'),
				type: new GraphQLNonNull(this.#fields.connectionType(schema)),
			})
			this.#root(fields, surface, 'count', {
				args: where,
				resolve: this.#execution.read(schema, 'count'),
				type: new GraphQLNonNull(GraphqlSafeInt),
			})
			this.#root(fields, surface, 'exists', {
				args: where,
				resolve: this.#execution.read(schema, 'exists'),
				type: new GraphQLNonNull(GraphQLBoolean),
			})
		}
		return fields
	}
}
