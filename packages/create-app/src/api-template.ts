import type { PluginId } from './catalog.js'
import {
	hasDataApi,
	hasPlugin as has,
	included,
	type InitializerPlan,
} from './config.js'

export const hasHttpListener = (plan: InitializerPlan): boolean =>
	has(plan, 'server-hono-plugin')

const hasGraphqlExplorer = (plan: InitializerPlan): boolean =>
	has(plan, 'graphiql-plugin') || has(plan, 'apollo-sandbox-plugin')

const hasPublishedAuth = (plan: InitializerPlan): boolean =>
	has(plan, 'password-auth-plugin') && hasDataApi(plan)

/** Import lines, in table order, for the selected plugins: [plugin, imported names]. */
export const pluginImports = (
	plan: InitializerPlan,
	entries: readonly (readonly [PluginId, string, ...string[]])[],
): string[] =>
	entries
		.filter(([id]) => has(plan, id))
		.map(([id, names]) => `import { ${names} } from '@ultimabase/${id}'`)

/** Only an exact operation allowlist publishes Password Auth over a selected protocol. */
const authOperations = (plan: InitializerPlan): string =>
	has(plan, 'password-auth-plugin')
		? `,
      operations: [
        passwordAuthOperations.signUp,
        passwordAuthOperations.login,
        passwordAuthOperations.refresh,
        passwordAuthOperations.logout,
      ]`
		: ''

const exposureEntry = (plan: InitializerPlan, factory: string): string =>
	`${factory}({
      // Local development only: this acknowledges unverified public policy coverage.
      acknowledgeUnverifiedProtection: true,
      default: { create: false, update: false, delete: false, upsert: false, bulk: false, mutations: false }${authOperations(plan)},
    })`

const explorerEntry = (factory: string): string =>
	`${factory}({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' })`

export const apiApplicationImports = (plan: InitializerPlan): string[] =>
	pluginImports(plan, [
		['http-plugin', 'httpPlugin'],
		['server-hono-plugin', 'honoServerPlugin'],
		['graphql-yoga-plugin', 'graphqlYogaPlugin'],
		['graphiql-plugin', 'graphiqlPlugin'],
		['apollo-sandbox-plugin', 'apolloSandboxPlugin'],
	])

/** Installs transport options before schema declaration so they are source typed. */
export const apiSchemaPluginImports = (plan: InitializerPlan): string[] => [
	...pluginImports(plan, [
		['rest-plugin', 'restPlugin'],
		['graphql-plugin', 'graphqlPlugin'],
	]),
	...(hasPublishedAuth(plan)
		? [
				"import { passwordAuthOperations } from '@ultimabase/password-auth-plugin'",
			]
		: []),
]

export const apiSchemaPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[has(plan, 'rest-plugin'), exposureEntry(plan, 'restPlugin')],
		[has(plan, 'graphql-plugin'), exposureEntry(plan, 'graphqlPlugin')],
	])

export const apiPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[has(plan, 'http-plugin'), "httpPlugin({ appId: 'main' })"],
		[
			has(plan, 'graphql-yoga-plugin'),
			hasGraphqlExplorer(plan)
				? "graphqlYogaPlugin({ introspection: process.env.NODE_ENV !== 'production' })"
				: 'graphqlYogaPlugin()',
		],
		[has(plan, 'graphiql-plugin'), explorerEntry('graphiqlPlugin')],
		[has(plan, 'apollo-sandbox-plugin'), explorerEntry('apolloSandboxPlugin')],
		[
			hasHttpListener(plan),
			"honoServerPlugin({ host: '127.0.0.1', port: 1337 })",
		],
	])

/** Generated member and role models are never an implicit public CRUD surface. */
export const privateSchemaApiOptions = (plan: InitializerPlan): string =>
	included([
		[has(plan, 'rest-plugin'), '  rest: false,'],
		[has(plan, 'graphql-plugin'), '  graphql: false,'],
	]).join('\n')

export const apiNextCommands = (plan: InitializerPlan): string[] => {
	const task = plan.starter === 'task'
	return included([
		[
			hasHttpListener(plan) &&
				task &&
				(has(plan, 'rest-plugin') || has(plan, 'graphql-yoga-plugin')),
			'Run the following request in another terminal while the server is running.',
		],
		[
			has(plan, 'rest-plugin') && task,
			"curl -i -H 'X-UltimaBase-Application-Id: main' 'http://127.0.0.1:1337/api/v1/classes/Task?select=id,title,done'",
		],
		[
			has(plan, 'graphql-yoga-plugin') && task,
			`curl -i -X POST -H 'X-UltimaBase-Application-Id: main' -H 'Content-Type: application/json' --data '{"query":"{ findManyTask(first: 10) { nodes { id title done } } }"}' http://127.0.0.1:1337/graphql`,
		],
		[
			has(plan, 'graphiql-plugin'),
			'Open http://127.0.0.1:1337/__ultimabase/apps/main/graphiql in development.',
		],
		[
			has(plan, 'apollo-sandbox-plugin'),
			'Open http://127.0.0.1:1337/__ultimabase/apps/main/apollo-sandbox in development.',
		],
	])
}

export const apiReadmeNotes = (plan: InitializerPlan): string[] =>
	included([
		[
			has(plan, 'http-plugin'),
			'HTTP identifies this application as `main`; each real request needs `X-UltimaBase-Application-Id: main`. This header selects an application, not authority. Browser-origin access and HTTP Master keys stay disabled.',
		],
		[
			hasHttpListener(plan),
			'The Hono listener binds to `127.0.0.1:1337` for development. It is not a public deployment configuration; keep it local until you add and review complete protection, rate limits, TLS, and hosting policy.',
		],
		[
			hasDataApi(plan),
			'Generated Task API mutations are disabled; the server-side Task write in `main` seeds a record. `acknowledgeUnverifiedProtection` only suppresses a diagnostic and never grants or proves authorization.',
		],
		[
			has(plan, 'access-plugin') && hasDataApi(plan),
			'Access intentionally denies ordinary Task reads. The sample API request therefore returns a permission error until you write an exact policy.',
		],
		[
			has(plan, 'acl-permissions-plugin') &&
				!has(plan, 'access-plugin') &&
				hasDataApi(plan),
			'The Task ACL starts empty, so ordinary API reads cannot see the seeded Task. Read-only API exposure does not open a create route.',
		],
		[
			hasPublishedAuth(plan),
			'Password Auth sign-up, login, refresh, and logout are exposed only through the selected transport operation allowlists. Sessions identify a caller; they do not grant Task access. Add online-attempt defenses before any public deployment.',
		],
		[
			has(plan, 'graphql-plugin') && !has(plan, 'graphql-yoga-plugin'),
			'GraphQL is network-independent in this selection; no `/graphql` HTTP endpoint exists.',
		],
		[
			has(plan, 'http-plugin') && !hasHttpListener(plan),
			'HTTP is configured without a server provider, so this application opens no listener.',
		],
		[
			hasHttpListener(plan) &&
				!has(plan, 'rest-plugin') &&
				!has(plan, 'graphql-yoga-plugin'),
			'The server has no generated data routes. Add REST or GraphQL Yoga when you want a network data API.',
		],
		[
			hasGraphqlExplorer(plan),
			'GraphQL introspection and the selected explorer are enabled only for development. Production mode contributes no explorer route.',
		],
	])
