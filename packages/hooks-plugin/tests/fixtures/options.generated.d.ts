import type {
	FieldHooksOption,
	SchemaHooksOption,
} from '@ultimabase/hooks-plugin'

/** Simulates the application-local declarations emitted when Hooks is installed. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly hooks?: FieldHooksOption<this>
	}

	interface UltimaBaseGeneratedSchemaOptions {
		readonly hooks?: SchemaHooksOption<this>
	}
}

export {}
