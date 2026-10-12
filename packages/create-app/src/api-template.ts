import type { PluginId } from './catalog.js'
import {
	hasDataApi,
	hasPlugin as has,
	included,
	type InitializerPlan,
} from './config.js'
import type { NamedImport } from './source.js'

export const hasHttpListener = (plan: InitializerPlan): boolean =>
	has(plan, 'hono-server-plugin')

const hasGraphqlExplorer = (plan: InitializerPlan): boolean =>
	has(plan, 'graphql-explorer-plugin')

const hasPublishedAuth = (plan: InitializerPlan): boolean =>
	has(plan, 'auth-plugin') && hasDataApi(plan)

// apiServer() installs HTTP and its transports (ADR-0325); GraphQL without
// its HTTP transport stays a separate network-independent plugin.
const usesApiServer = (plan: InitializerPlan): boolean =>
	has(plan, 'http-plugin')

const graphqlOverHttp = (plan: InitializerPlan): boolean =>
	usesApiServer(plan) && has(plan, 'graphql-yoga-plugin')

/** Imports, in table order, for the selected plugins: [plugin, imported names]. */
export const pluginImports = (
	plan: InitializerPlan,
	entries: readonly (readonly [PluginId, string, ...string[]])[],
): NamedImport[] =>
	entries
		.filter(([id]) => has(plan, id))
		.map(([id, names]) => [`@ultimabase/${id}`, names] as const)

/**
 * Authentication declares its operations public (ADR-0324): its own `/auth`
 * routes serve HTTP clients, so REST hides them; GraphQL exposes them all.
 */
const hiddenAuthOperations = (plan: InitializerPlan, indent: string): string =>
	has(plan, 'auth-plugin')
		? `,
${indent}// Served under /auth by authPlugin (ADR-0326).
${indent}hide: [...Object.values(authOperations), ...Object.values(passwordOperations)]`
		: ''

// Read-only data APIs need no protected policy; writes would (ADR-0294).
const readOnly =
	'default: { createOne: false, updateOne: false, deleteOne: false }'

const restOptions = (plan: InitializerPlan): string =>
	`{
      ${readOnly}${hiddenAuthOperations(plan, '      ')},
    }`

const graphqlOptions = (explorer: boolean): string =>
	`{
      ${readOnly}${
				explorer
					? `,
      // GraphiQL at /graphiql, in development only (ADR-0325).
      explorer: 'graphiql'`
					: ''
			},
    }`

const apiServerEntry = (plan: InitializerPlan): string => {
	const options = included([
		[has(plan, 'rest-plugin'), `    rest: ${restOptions(plan)},`],
		[
			graphqlOverHttp(plan),
			`    graphql: ${graphqlOptions(hasGraphqlExplorer(plan))},`,
		],
		[!hasHttpListener(plan), '    server: false,'],
	])
	return options.length === 0
		? '...apiServer()'
		: `...apiServer({
${options.join('\n')}
  })`
}

/** Installs transport options before schema declaration so they are source typed. */
export const apiSchemaPluginImports = (
	plan: InitializerPlan,
): NamedImport[] => [
	...(usesApiServer(plan)
		? [['@ultimabase/api-server', 'apiServer'] as const]
		: []),
	...(has(plan, 'graphql-plugin') && !graphqlOverHttp(plan)
		? [['@ultimabase/graphql-plugin', 'graphqlPlugin'] as const]
		: []),
	...(hasPublishedAuth(plan) && has(plan, 'rest-plugin')
		? [
				['@ultimabase/auth-plugin', 'authOperations'] as const,
				['@ultimabase/auth-password', 'passwordOperations'] as const,
			]
		: []),
]

export const apiSchemaPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[usesApiServer(plan), apiServerEntry(plan)],
		[
			has(plan, 'graphql-plugin') && !graphqlOverHttp(plan),
			`graphqlPlugin(${graphqlOptions(false)})`,
		],
	])

/** Generated member and role models are never an implicit public CRUD surface. */
export const privateSchemaApiOptions = (plan: InitializerPlan): string[] =>
	included([
		[has(plan, 'rest-plugin'), '  rest: false,'],
		[has(plan, 'graphql-plugin'), '  graphql: false,'],
	])

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
			"curl -i 'http://127.0.0.1:1337/api/classes/Task?select=id,title,done'",
		],
		[
			has(plan, 'graphql-yoga-plugin') && task,
			`curl -i -X POST -H 'Content-Type: application/json' --data '{"query":"{ findManyTask(first: 10) { nodes { id title done } } }"}' http://127.0.0.1:1337/graphql`,
		],
		[
			hasGraphqlExplorer(plan),
			'Open http://127.0.0.1:1337/graphiql in development.',
		],
	])
}

export const apiReadmeNotes = (plan: InitializerPlan): string[] =>
	included([
		[
			has(plan, 'http-plugin'),
			'HTTP serves this application as `main`: requests reach it without an application header, and `GET /health` reports its health. Browser-origin access (`browser.origins`) and HTTP Master keys stay disabled; requests are limited to 1 MiB bodies and 30 seconds.',
		],
		[
			hasHttpListener(plan),
			'The Hono listener binds to `127.0.0.1:1337` in development (`HOST` and `PORT` override it; `NODE_ENV=production` listens on every interface). Keep it local until you add and review complete protection, rate limits, TLS, and hosting policy.',
		],
		[
			hasDataApi(plan),
			'Generated Task API mutations are disabled; the server-side Task write in `main` seeds a record. REST and GraphQL refuse to start with public writes unless a policy plugin such as Access is installed or you pass `publicWrites: true` in their options.',
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
			'Authentication serves sign-up, login, sessions, password change and account deletion under /auth; GraphQL exposes the same operations and REST hides them. Sessions identify a caller; they do not grant Task access. Logins are limited per account and per account and address; the HTTP plugin can add a global per-address limit.',
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
			'GraphQL introspection and the selected explorer follow `NODE_ENV`: enabled in development, absent when `NODE_ENV=production`.',
		],
	])
