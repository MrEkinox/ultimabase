import type { SchemaDefinition, SchemaTargetGraph } from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import type { CompiledPostgresSchema } from './contracts.js'
import { compilePostgresSchemas } from './schema-compiler.js'

/** Owns application-scoped compiled tables without exposing mutable map operations. */
export class PostgresSchemaCatalog {
	readonly #schemas = new Map<object, CompiledPostgresSchema>()

	constructor(
		schemas: readonly SchemaDefinition[],
		targets?: SchemaTargetGraph,
	) {
		const compiled = compilePostgresSchemas(schemas, targets)

		for (const [position, schema] of schemas.entries()) {
			const compiledSchema = compiled[position]

			if (compiledSchema === undefined) {
				throw new TypeError(
					'PostgreSQL schema catalog compilation is incomplete',
				)
			}

			this.#schemas.set(schema, compiledSchema)
		}
	}

	/** Resolves the exact static schema identity retained by each Query AST. */
	get(schema: unknown): CompiledPostgresSchema {
		if (
			(typeof schema !== 'object' || schema === null) &&
			typeof schema !== 'function'
		) {
			throw new TypeError('PostgreSQL operation does not reference a schema')
		}

		const compiled = this.#schemas.get(schema)

		if (compiled === undefined) {
			const className =
				'className' in schema && typeof schema.className === 'string'
					? schema.className
					: 'unknown'

			throw new TypeError(`PostgreSQL schema is not registered: ${className}`)
		}

		return compiled
	}

	/** Lists exact managed table identifiers for catalog ownership classification. */
	tableNames(): readonly string[] {
		return immutableArray(
			[...this.#schemas.values()].map(({ tableName }) => tableName),
		)
	}

	/** Returns compiled schemas in declaration order for deterministic preparation. */
	values(): readonly CompiledPostgresSchema[] {
		return immutableArray([...this.#schemas.values()])
	}
}
