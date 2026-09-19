import type {
	PostgresFieldOption,
	PostgresSchemaOption,
} from '../../src/options.js'

/** Installs application option types without importing another executable suite. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly postgres?: PostgresFieldOption
	}
	interface UltimaBaseGeneratedSchemaOptions {
		readonly postgres?: PostgresSchemaOption
	}
}
