import type {
	CompiledSchemaRegistry,
	SchemaDefinition,
} from '@ultimabase/core'

import type { GraphqlSchemaSurface } from './surfaces.js'

/** Reads required GraphQL surfaces and targets from one compiled application graph. */
export class GraphqlCompiledSchemaLookup {
	readonly #schemas: CompiledSchemaRegistry
	readonly #surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>

	constructor(
		schemas: CompiledSchemaRegistry,
		surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>,
	) {
		this.#schemas = schemas
		this.#surfaces = surfaces
	}

	surface(schema: SchemaDefinition): GraphqlSchemaSurface {
		const surface = this.#surfaces.get(schema)
		if (surface === undefined) {
			throw new TypeError('GraphQL schema surface is unavailable')
		}
		return surface
	}

	target(schema: SchemaDefinition, path: readonly string[]): SchemaDefinition {
		const target = this.#schemas.schemaTargets.get(schema, path)
		if (target === undefined) {
			throw new TypeError(
				`Missing compiled target for ${schema.className}.${path.join('.')}`,
			)
		}
		return target
	}
}
