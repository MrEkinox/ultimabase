import { createApplication } from '@ultimabase/core'
import { Pool } from 'pg'
import { expectTypeOf, test } from 'vitest'

import type { PostgresConnectionService } from '../connection/contracts.js'
import { postgresConnectionServiceToken } from '../connection/contracts.js'
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
	const application = await createApplication({
		schemas: [],
		plugins: [urlPlugin],
	})
	const pluginExports = application.getPlugin('@ultimabase/postgres')
	const connection = application.getService(postgresConnectionServiceToken)

	expectTypeOf(urlPlugin).toEqualTypeOf<PostgresPlugin>()
	expectTypeOf(poolPlugin).toEqualTypeOf<PostgresPlugin>()
	expectTypeOf(urlPlugin.name).toEqualTypeOf<'@ultimabase/postgres'>()
	expectTypeOf(urlPlugin.slot).toEqualTypeOf<'database-adapter' | undefined>()
	expectTypeOf(pluginExports).toEqualTypeOf<Readonly<PostgresPluginExports>>()
	expectTypeOf(connection).toEqualTypeOf<PostgresConnectionService>()
	expectTypeOf(connection).not.toHaveProperty('pool')
})

test('requires exactly one typed connection source', () => {
	// @ts-expect-error -- PostgreSQL needs either a URL or an existing pool.
	postgresPlugin({})
	// @ts-expect-error -- Connection ownership is ambiguous when both are present.
	postgresPlugin({ url: 'postgresql://localhost/fixture', pool: new Pool() })
	postgresPlugin({
		url: 'postgresql://localhost/fixture',
		// @ts-expect-error -- Schema policies are a closed safety contract.
		schemaPolicy: 'unsafe',
	})
})
