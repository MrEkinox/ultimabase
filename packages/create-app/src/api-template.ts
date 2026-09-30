import type { PluginId } from './catalog.js'
import type { InitializerPlan } from './config.js'

const has = (plan: InitializerPlan, id: PluginId): boolean =>
	plan.plugins.includes(id)

export const hasHttpListener = (plan: InitializerPlan): boolean =>
	has(plan, 'server-hono-plugin')

const hasGraphqlExplorer = (plan: InitializerPlan): boolean =>
	has(plan, 'graphiql-plugin') || has(plan, 'apollo-sandbox-plugin')

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

export const apiApplicationImports = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'http-plugin')
		? ["import { httpPlugin } from '@ultimabase/http-plugin'"]
		: []),
	...(has(plan, 'server-hono-plugin')
		? ["import { honoServerPlugin } from '@ultimabase/server-hono-plugin'"]
		: []),
	...(has(plan, 'graphql-yoga-plugin')
		? ["import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'"]
		: []),
	...(has(plan, 'graphiql-plugin')
		? ["import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'"]
		: []),
	...(has(plan, 'apollo-sandbox-plugin')
		? [
				"import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'",
			]
		: []),
]

/** Installs transport options before schema declaration so they are source typed. */
export const apiSchemaPluginImports = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'rest-plugin')
		? ["import { restPlugin } from '@ultimabase/rest-plugin'"]
		: []),
	...(has(plan, 'graphql-plugin')
		? ["import { graphqlPlugin } from '@ultimabase/graphql-plugin'"]
		: []),
	...(has(plan, 'password-auth-plugin') &&
	(has(plan, 'rest-plugin') || has(plan, 'graphql-plugin'))
		? [
				"import { passwordAuthOperations } from '@ultimabase/password-auth-plugin'",
			]
		: []),
]

export const apiSchemaPluginEntries = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'rest-plugin')
		? [
				`restPlugin({
      // Local development only: this acknowledges unverified public policy coverage.
      acknowledgeUnverifiedProtection: true,
      default: { create: false, update: false, delete: false, upsert: false, bulk: false, mutations: false }${authOperations(plan)},
    })`,
			]
		: []),
	...(has(plan, 'graphql-plugin')
		? [
				`graphqlPlugin({
      // Local development only: this acknowledges unverified public policy coverage.
      acknowledgeUnverifiedProtection: true,
      default: { create: false, update: false, delete: false, upsert: false, bulk: false, mutations: false }${authOperations(plan)},
    })`,
			]
		: []),
]

export const apiPluginEntries = (plan: InitializerPlan): readonly string[] => [
	...(has(plan, 'http-plugin') ? ["httpPlugin({ appId: 'main' })"] : []),
	...(has(plan, 'graphql-yoga-plugin')
		? [
				hasGraphqlExplorer(plan)
					? "graphqlYogaPlugin({ introspection: process.env.NODE_ENV !== 'production' })"
					: 'graphqlYogaPlugin()',
			]
		: []),
	...(has(plan, 'graphiql-plugin')
		? [
				"graphiqlPlugin({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' })",
			]
		: []),
	...(has(plan, 'apollo-sandbox-plugin')
		? [
				"apolloSandboxPlugin({ environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' })",
			]
		: []),
	...(hasHttpListener(plan)
		? ["honoServerPlugin({ host: '127.0.0.1', port: 1337 })"]
		: []),
]

/** Generated member and role models are never an implicit public CRUD surface. */
export const privateSchemaApiOptions = (plan: InitializerPlan): string =>
	[
		...(has(plan, 'rest-plugin') ? ['  rest: false,'] : []),
		...(has(plan, 'graphql-plugin') ? ['  graphql: false,'] : []),
	].join('\n')

export const apiDependencies = (
	plan: InitializerPlan,
): Readonly<Record<string, string>> =>
	Object.fromEntries(
		(
			[
				'http-plugin',
				'server-hono-plugin',
				'rest-plugin',
				'graphql-plugin',
				'graphql-yoga-plugin',
				'graphiql-plugin',
				'apollo-sandbox-plugin',
			] as const
		)
			.filter((id) => has(plan, id))
			.map((id) => [`@ultimabase/${id}`, '^0.0.0']),
	)

export const apiNextCommands = (plan: InitializerPlan): readonly string[] => [
	...(hasHttpListener(plan) &&
	plan.starter === 'task' &&
	(has(plan, 'rest-plugin') || has(plan, 'graphql-yoga-plugin'))
		? [
				'Run the following request in another terminal while the server is running.',
			]
		: []),
	...(has(plan, 'rest-plugin') && plan.starter === 'task'
		? [
				"curl -i -H 'X-UltimaBase-Application-Id: main' 'http://127.0.0.1:1337/api/v1/classes/Task?select=id,title,done'",
			]
		: []),
	...(has(plan, 'graphql-yoga-plugin') && plan.starter === 'task'
		? [
				`curl -i -X POST -H 'X-UltimaBase-Application-Id: main' -H 'Content-Type: application/json' --data '{"query":"{ findManyTask(first: 10) { nodes { id title done } } }"}' http://127.0.0.1:1337/graphql`,
			]
		: []),
	...(has(plan, 'graphiql-plugin')
		? [
				'Open http://127.0.0.1:1337/__ultimabase/apps/main/graphiql in development.',
			]
		: []),
	...(has(plan, 'apollo-sandbox-plugin')
		? [
				'Open http://127.0.0.1:1337/__ultimabase/apps/main/apollo-sandbox in development.',
			]
		: []),
]

export const apiReadmeNotes = (plan: InitializerPlan): readonly string[] => [
	...(has(plan, 'http-plugin')
		? [
				'HTTP identifies this application as `main`; each real request needs `X-UltimaBase-Application-Id: main`. This header selects an application, not authority. Browser-origin access and HTTP Master keys stay disabled.',
			]
		: []),
	...(hasHttpListener(plan)
		? [
				'The Hono listener binds to `127.0.0.1:1337` for development. It is not a public deployment configuration; keep it local until you add and review complete protection, rate limits, TLS, and hosting policy.',
			]
		: []),
	...(has(plan, 'rest-plugin') || has(plan, 'graphql-plugin')
		? [
				'Generated Task API mutations are disabled; the server-side Task write in `main` seeds a record. `acknowledgeUnverifiedProtection` only suppresses a diagnostic and never grants or proves authorization.',
			]
		: []),
	...(has(plan, 'access-plugin') &&
	(has(plan, 'rest-plugin') || has(plan, 'graphql-plugin'))
		? [
				'Access intentionally denies ordinary Task reads. The sample API request therefore returns a permission error until you write an exact policy.',
			]
		: []),
	...(has(plan, 'acl-permissions-plugin') &&
	!has(plan, 'access-plugin') &&
	(has(plan, 'rest-plugin') || has(plan, 'graphql-plugin'))
		? [
				'The Task ACL starts empty, so ordinary API reads cannot see the seeded Task. Read-only API exposure does not open a create route.',
			]
		: []),
	...(has(plan, 'password-auth-plugin') &&
	(has(plan, 'rest-plugin') || has(plan, 'graphql-plugin'))
		? [
				'Password Auth sign-up, login, refresh, and logout are exposed only through the selected transport operation allowlists. Sessions identify a caller; they do not grant Task access. Add online-attempt defenses before any public deployment.',
			]
		: []),
	...(has(plan, 'graphql-plugin') && !has(plan, 'graphql-yoga-plugin')
		? [
				'GraphQL is network-independent in this selection; no `/graphql` HTTP endpoint exists.',
			]
		: []),
	...(has(plan, 'http-plugin') && !hasHttpListener(plan)
		? [
				'HTTP is configured without a server provider, so this application opens no listener.',
			]
		: []),
	...(hasHttpListener(plan) &&
	!has(plan, 'rest-plugin') &&
	!has(plan, 'graphql-yoga-plugin')
		? [
				'The server has no generated data routes. Add REST or GraphQL Yoga when you want a network data API.',
			]
		: []),
	...(hasGraphqlExplorer(plan)
		? [
				'GraphQL introspection and the selected explorer are enabled only for development. Production mode contributes no explorer route.',
			]
		: []),
]
