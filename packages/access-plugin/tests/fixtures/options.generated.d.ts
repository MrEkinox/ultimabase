import type { FieldAccessOption, SchemaAccessOption } from '../../src/index.js'

/** Installs application option types without importing another executable suite. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly access?: FieldAccessOption<this>
	}
	interface UltimaBaseGeneratedVirtualFieldOptions {
		readonly access?: FieldAccessOption<this>
	}
	interface UltimaBaseGeneratedSchemaOptions {
		readonly access?: SchemaAccessOption<this>
	}
}
