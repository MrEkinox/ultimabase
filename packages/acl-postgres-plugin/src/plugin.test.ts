import { acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { createApplication, Schema } from '@ultimabase/core'
import {
	postgresPlugin,
	type PostgresPool,
	type PostgresPoolClient,
	type PostgresQueryResult,
} from '@ultimabase/postgres-plugin'
import { describe, expect, it } from 'vitest'

import { aclPostgresPlugin, aclPostgresPluginName } from './plugin.js'

const Protected = Schema.define({
	className: 'ACLPostgresPluginFixture',
	fields: () => ({}),
	extensions: [acl()],
})

/** Satisfies setup without allowing a unit test to perform database I/O. */
class IdlePool implements PostgresPool {
	connect(): Promise<PostgresPoolClient> {
		throw new TypeError('ACL PostgreSQL setup must not connect')
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(): Promise<PostgresQueryResult> {
		throw new TypeError('ACL PostgreSQL setup must not query')
	}
}

describe('aclPostgresPlugin', () => {
	it('declares both integration dependencies and registers during setup', async () => {
		const integration = aclPostgresPlugin()
		const application = await createApplication({
			plugins: [
				aclPlugin(),
				postgresPlugin({ pool: new IdlePool() }),
				integration,
			],
			schemas: [Protected],
		})

		expect(integration.manifest.identity.pluginId).toBe(aclPostgresPluginName)
		expect(integration.dependencies).toStrictEqual([
			'ultimabase.acl',
			'@ultimabase/postgres-plugin',
		])
		await application.dispose()
	})

	it('fails setup when either concrete dependency is absent', async () => {
		await expect(
			createApplication({ plugins: [aclPostgresPlugin()], schemas: [] }),
		).rejects.toThrow('requires missing plugin')
	})
})
