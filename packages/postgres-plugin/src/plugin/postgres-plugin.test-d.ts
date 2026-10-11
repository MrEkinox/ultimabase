import { UltimaBase } from '@ultimabase/core'
import { Pool } from 'pg'
import { expectTypeOf, test } from 'vitest'

import type { PostgresConnectionService } from '../connection/contracts.js'
import {
	postgresPlugin,
	type PostgresPlugin,
	type PostgresPluginExports,
} from './postgres-plugin.js'

test('accepts URL and pg-compatible existing-pool configuration', async () => {
	const urlPlugin = postgresPlugin({
		url: 'postgresql://localhost/fixture',
		schemaPolicy: 'fail',
	})
	const poolPlugin = postgresPlugin({ pool: new Pool() })
	const application = new (UltimaBase.use(urlPlugin))({ schemas: [] })
	await application.initialize()
	const pluginExports = application.plugin('@ultimabase/postgres-plugin')
	const connection = pluginExports.connection

	expectTypeOf(urlPlugin).toEqualTypeOf<PostgresPlugin>()
	expectTypeOf(poolPlugin).toEqualTypeOf<PostgresPlugin>()
	expectTypeOf(
		urlPlugin.manifest.identity.pluginId,
	).toEqualTypeOf<'@ultimabase/postgres-plugin'>()
	expectTypeOf(urlPlugin.manifest.capabilities.provides).toHaveProperty(0)
	expectTypeOf(pluginExports).toEqualTypeOf<Readonly<PostgresPluginExports>>()
	expectTypeOf(connection).toEqualTypeOf<PostgresConnectionService>()
	expectTypeOf(connection).not.toHaveProperty('pool')
})

test('accepts at most one typed connection source', () => {
	// ADR-0312: without url or pool, DATABASE_URL is read at start.
	postgresPlugin()
	postgresPlugin({})
	postgresPlugin({ schemaPolicy: 'fail' })
	// @ts-expect-error -- Connection ownership is ambiguous when both are present.
	postgresPlugin({ url: 'postgresql://localhost/fixture', pool: new Pool() })
	postgresPlugin({
		url: 'postgresql://localhost/fixture',
		// @ts-expect-error -- Schema policies are a closed safety contract.
		schemaPolicy: 'unsafe',
	})
})

test('types connection settings in URL modes and debugging everywhere (ADR-0320)', () => {
	postgresPlugin({
		url: 'postgresql://localhost/fixture',
		connection: {
			max: 20,
			ssl: { ca: 'PEM', rejectUnauthorized: true },
			statementTimeoutMs: 5000,
			idleTimeoutMs: 10_000,
			connectRetries: 5,
		},
		debug: { logQueries: true, slowQueryMs: 500 },
	})
	postgresPlugin({ connection: { ssl: true } })
	postgresPlugin({ pool: new Pool(), debug: { slowQueryMs: 500 } })
	postgresPlugin({
		pool: new Pool(),
		// @ts-expect-error -- An injected pool keeps its own settings.
		connection: { max: 2 },
	})
	postgresPlugin({
		url: 'postgresql://localhost/fixture',
		// @ts-expect-error -- Unknown connection settings are rejected.
		connection: { min: 2 },
	})
	postgresPlugin({
		url: 'postgresql://localhost/fixture',
		// @ts-expect-error -- Statement values are never logged.
		debug: { logValues: true },
	})
})

// @ts-expect-error The preparation marker is no longer part of the public package.
import type { PostgresSchemaPreparationCapability } from '../index.js'
void (undefined as unknown as PostgresSchemaPreparationCapability)
