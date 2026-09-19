import type { GraphqlSchemaExposureOption } from '../../src/index.js'

/** Installs application option types without importing another executable suite. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}
