//#region database
import process from 'node:process'

import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * The plugin creates and owns its pool from `DATABASE_URL`, read when the
 * application starts. Without `schemaPolicy`, `NODE_ENV=production` selects
 * `fail` and any other value `override`.
 */
export const database = postgresPlugin({
	connection: {
		max: 20,
		// TLS with the provider's certificate authority, when one is set.
		ssl:
			process.env.DATABASE_CA === undefined
				? false
				: { ca: process.env.DATABASE_CA },
		statementTimeoutMs: 5000,
		idleTimeoutMs: 30_000,
		// A database that is still starting, as in Docker Compose.
		connectRetries: 5,
	},
	// One `warn` line per slow statement, without its values.
	debug: { slowQueryMs: 500 },
})
//#endregion database
