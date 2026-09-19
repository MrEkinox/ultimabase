import type { ACLSchemaOption } from '../../src/acl-option.js'

/** Installs the same application option for isolated ACL and consumer test projects. */
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly acl?: ACLSchemaOption<this>
	}
}
