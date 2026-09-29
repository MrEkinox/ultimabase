import type { SchemaAccessOption } from '../../src/index.js'

/** Simulates the application-local schema declaration emitted for Access. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly access?: SchemaAccessOption<this>
	}
}

export {}
