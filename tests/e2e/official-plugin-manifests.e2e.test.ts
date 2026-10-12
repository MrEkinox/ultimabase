import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { passwordAuthPlugin } from '@ultimabase/password-auth-plugin'
import {
	postgresPlugin,
	type PostgresPool,
	type PostgresPoolClient,
} from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { typegenPlugin } from '@ultimabase/typegen'
import { validationPlugin } from '@ultimabase/validation-plugin'
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
		validationPlugin().manifest,
		softDeletePlugin().manifest,
		httpPlugin({ appId: 'manifest-fixture' }).manifest,
		restPlugin().manifest,
		graphqlPlugin().manifest,
		graphqlYogaPlugin().manifest,
		graphqlExplorerPlugin({ environment: 'development' }).manifest,
		graphqlExplorerPlugin({
			environment: 'development',
			ui: 'apollo-sandbox',
		}).manifest,
		graphqlPlugin({ sdl: './schema.graphql' }).manifest,
		aclPlugin().manifest,
		rolesPlugin().manifest,
		pgVectorPlugin().manifest,
		passwordAuthPlugin().manifest,
		honoServerPlugin().manifest,
	]

	expect(
		manifests.map((manifest) => ({
			environment: manifest.environment,
			pluginId: manifest.identity.pluginId,
			privileges: manifest.privileges.map(
				({ name }: { readonly name: string }) => name,
			),
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
			privileges: ['schema:declare'],
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
			pluginId: '@ultimabase/validation-plugin',
			privileges: ['schema:declare', 'runtime:intercept'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/soft-delete-plugin',
			privileges: [
				'schema:declare',
				'model:extend',
				'operation:declare',
				'runtime:constrain',
				'persistence:rewrite',
				'typegen:reference',
			],
		},
		{
			environment: [],
			pluginId: '@ultimabase/http-plugin',
			privileges: [],
		},
		{
			environment: [],
			pluginId: '@ultimabase/rest-plugin',
			privileges: ['schema:declare', 'transport:expose'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/graphql-plugin',
			privileges: ['schema:declare', 'transport:expose'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/graphql-yoga-plugin',
			privileges: ['transport:expose'],
		},
		{
			environment: ['environment:network'],
			pluginId: '@ultimabase/graphql-explorer-plugin',
			privileges: ['transport:expose'],
		},
		{
			environment: ['environment:network'],
			pluginId: '@ultimabase/graphql-explorer-plugin',
			privileges: ['transport:expose'],
		},
		{
			// The SDL file is written at startup (ADR-0325).
			environment: ['environment:filesystem'],
			pluginId: '@ultimabase/graphql-plugin',
			privileges: ['schema:declare', 'transport:expose'],
		},
		{
			environment: [],
			pluginId: '@ultimabase/acl-permissions-plugin',
			privileges: [
				'schema:declare',
				'runtime:intercept',
				'runtime:constrain',
				'event:publish',
				'authority:elevate',
			],
		},
		{
			environment: [],
			pluginId: '@ultimabase/roles-plugin',
			privileges: [
				'schema:declare',
				'runtime:intercept',
				'event:publish',
				'authority:elevate',
			],
		},
		{
			environment: [],
			pluginId: '@ultimabase/pg-vector-plugin',
			privileges: ['schema:declare'],
		},
		{
			environment: ['environment:native-code'],
			pluginId: '@ultimabase/password-auth-plugin',
			privileges: [
				'schema:declare',
				'storage:private',
				'operation:declare',
				'runtime:intercept',
				'transport:expose',
				'typegen:reference',
				'authority:elevate',
			],
		},
		{
			environment: ['environment:network'],
			pluginId: '@ultimabase/hono-server-plugin',
			privileges: [],
		},
	])
	expect(manifests.map(({ identity }) => identity.pluginId)).not.toContain(
		'ultimabase.acl-postgres',
	)
})
