import type { SchemaDefinition, SchemaTargetGraph } from '@ultimabase/core'

import type { CompiledPostgresSchema } from './contracts.js'
import { compilePostgresSchemas } from './schema-compiler.js'

/** Compiles one schema through the production multi-schema path for focused tests. */
export const compilePostgresSchema = (
	schema: SchemaDefinition,
	targets?: SchemaTargetGraph,
): CompiledPostgresSchema => {
	const compiled = compilePostgresSchemas([schema], targets)[0]

	if (compiled === undefined) {
		throw new TypeError('PostgreSQL schema compilation returned no schema')
	}

	return compiled
}
