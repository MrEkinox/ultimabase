import type { SchemaHooksOption } from '@ultimabase/hooks-plugin'

/** Simulates the application-local schema declaration emitted for Hooks. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly hooks?: SchemaHooksOption<this>
	}
}

export {}
