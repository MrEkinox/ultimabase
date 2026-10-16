import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { graphqlExplorerPlugin } from '@ultimabase/graphql-explorer-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import {
	postgresPlugin,
	type PostgresPool,
	type PostgresPoolClient,
} from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { defineOperation, definePlugin } from '@ultimabase/plugin-kit'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { z } from 'zod'

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
		authPlugin({ methods: [password()] }).manifest,
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
			pluginId: '@ultimabase/auth-plugin',
			privileges: [
				'schema:declare',
				'storage:private',
				'operation:declare',
				'runtime:intercept',
				'transport:expose',
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

const packagesDirectory = path.resolve(import.meta.dirname, '../../packages')

/** Reads one field of an untrusted package manifest. */
const readField = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

/** Reads one string-keyed map from an untrusted package manifest. */
const readRecord = (
	value: unknown,
	key: string,
): Readonly<Record<string, unknown>> => {
	const entry = readField(value, key)
	return typeof entry === 'object' && entry !== null
		? Object.fromEntries(Object.entries(entry))
		: {}
}

const packageManifests = readdirSync(packagesDirectory, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry): unknown =>
		JSON.parse(
			readFileSync(
				path.join(packagesDirectory, entry.name, 'package.json'),
				'utf8',
			),
		),
	)

const packageName = (manifest: unknown): unknown => readField(manifest, 'name')

const coreVersion = readField(
	packageManifests.find(
		(manifest) => packageName(manifest) === '@ultimabase/core',
	),
	'version',
)

/**
 * The Core range a package publishes: its `@ultimabase/core` peer (a plugin
 * shares the application's Core instance), with Yarn's `workspace:` protocol
 * replaced as `yarn npm publish` replaces it.
 */
const publishedCoreRange = (name: string): unknown => {
	const manifest = packageManifests.find(
		(candidate) => packageName(candidate) === name,
	)
	const range = readRecord(manifest, 'peerDependencies')['@ultimabase/core']
	if (typeof range !== 'string' || !range.startsWith('workspace:')) return range
	const specifier = range.slice('workspace:'.length)
	if (specifier === '*') return coreVersion
	if (specifier === '^' || specifier === '~') {
		return `${specifier}${String(coreVersion)}`
	}
	return specifier
}

it('declares the Core range each official plugin package publishes (ADR-0338)', () => {
	const declared = [
		['@ultimabase/postgres-plugin', postgresPlugin({ pool }).manifest.core],
		['@ultimabase/access-plugin', accessPlugin().manifest.core],
		['@ultimabase/hooks-plugin', hooksPlugin().manifest.core],
		['@ultimabase/validation-plugin', validationPlugin().manifest.core],
		['@ultimabase/soft-delete-plugin', softDeletePlugin().manifest.core],
		[
			'@ultimabase/http-plugin',
			httpPlugin({ appId: 'manifest-fixture' }).manifest.core,
		],
		['@ultimabase/rest-plugin', restPlugin().manifest.core],
		['@ultimabase/graphql-plugin', graphqlPlugin().manifest.core],
		['@ultimabase/graphql-yoga-plugin', graphqlYogaPlugin().manifest.core],
		[
			'@ultimabase/graphql-explorer-plugin',
			graphqlExplorerPlugin({ environment: 'development' }).manifest.core,
		],
		['@ultimabase/acl-permissions-plugin', aclPlugin().manifest.core],
		['@ultimabase/roles-plugin', rolesPlugin().manifest.core],
		['@ultimabase/pg-vector-plugin', pgVectorPlugin().manifest.core],
		[
			'@ultimabase/auth-plugin',
			authPlugin({ methods: [password()] }).manifest.core,
		],
		['@ultimabase/hono-server-plugin', honoServerPlugin().manifest.core],
		[
			'@ultimabase/plugin-kit',
			definePlugin({ name: '@fixture/core-range' }).manifest.core,
		],
		[
			'@ultimabase/plugin-kit',
			defineOperation({
				name: 'coreRange',
				input: z.object({}),
				output: z.object({}),
				handler: () => ({}),
			}).manifest.core,
		],
	] as const

	// Every package that makes plugins is listed: `*-plugin` packages and Plugin Kit.
	expect(new Set(declared.map(([name]) => name))).toStrictEqual(
		new Set(
			packageManifests
				.map(packageName)
				.filter(
					(name) =>
						typeof name === 'string' &&
						(name.endsWith('-plugin') || name === '@ultimabase/plugin-kit'),
				),
		),
	)
	// A Core release moves the published range: the manifests must move with it.
	expect(declared.map(([name, core]) => ({ name, core }))).toStrictEqual(
		declared.map(([name]) => ({ name, core: publishedCoreRange(name) })),
	)
})
