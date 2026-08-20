import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import {
	postgresPlugin,
	type PostgresPool,
	type PostgresPoolClient,
} from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { typegenPlugin } from '@ultimabase/typegen'
import { expect, it } from 'vitest'

const pool: PostgresPool = {
	connect: (): Promise<PostgresPoolClient> =>
		Promise.resolve({
			query: () => Promise.resolve({ rows: [] }),
			release: () => undefined,
		}),
	end: () => Promise.resolve(),
	query: () => Promise.resolve({ rows: [] }),
}

it('publishes the audited privilege and environment contract for every official plugin', () => {
	const manifests = [
		typegenPlugin().manifest,
		postgresPlugin({ pool }).manifest,
		accessPlugin().manifest,
		hooksPlugin().manifest,
		aclPlugin().manifest,
		rolesPlugin().manifest,
		aclPostgresPlugin().manifest,
		pgVectorPlugin().manifest,
	]

	expect(
		manifests.map((manifest) => ({
			environment: manifest.environment,
			pluginId: manifest.identity.pluginId,
			privileges: manifest.privileges.map(({ name }) => name),
		})),
	).toStrictEqual([
		{
			environment: ['environment:filesystem'],
			pluginId: '@ultimabase/typegen',
			privileges: [],
		},
		{
			environment: ['environment:network'],
			pluginId: '@ultimabase/postgres-plugin',
			privileges: ['adapter:consume'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/access-plugin',
			privileges: ['schema:declare', 'runtime:constrain'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/hooks-plugin',
			privileges: ['schema:declare', 'runtime:intercept'],
		},
		{
			environment: [],
			pluginId: 'ultimabase.acl',
			privileges: [
				'authority:elevate',
				'runtime:constrain',
				'runtime:intercept',
				'event:publish',
			],
		},
		{
			environment: [],
			pluginId: 'ultimabase.roles',
			privileges: ['authority:elevate', 'runtime:intercept', 'event:publish'],
		},
		{
			environment: [],
			pluginId: 'ultimabase.acl-postgres',
			privileges: ['adapter:consume'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/pg-vector-plugin',
			privileges: ['schema:declare'],
		},
	])
})
