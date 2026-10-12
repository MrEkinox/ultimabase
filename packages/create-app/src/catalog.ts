// This packaged snapshot is checked against repository workspaces and the website catalog.
export const officialPlugins = [
	{
		id: 'access-plugin',
		label: 'Access',
		group: 'Security',
		hint: 'Operation and field access rules',
	},
	{
		id: 'acl-permissions-plugin',
		label: 'Object ACLs',
		group: 'Security',
		hint: 'Per-record permissions',
	},
	{
		id: 'auth-plugin',
		label: 'Authentication',
		group: 'Security',
		hint: 'Email and password sign-in, sessions; no CRUD permission',
	},
	{
		id: 'graphql-explorer-plugin',
		label: 'GraphQL explorer',
		group: 'HTTP & explorers',
		hint: 'Development GraphiQL page',
	},
	{
		id: 'graphql-plugin',
		label: 'GraphQL',
		group: 'HTTP & explorers',
		hint: 'GraphQL schema and operations',
	},
	{
		id: 'graphql-yoga-plugin',
		label: 'GraphQL Yoga',
		group: 'HTTP & explorers',
		hint: 'GraphQL over HTTP',
	},
	{
		id: 'hooks-plugin',
		label: 'Hooks',
		group: 'Data & behavior',
		hint: 'Transactional lifecycle hooks',
	},
	{
		id: 'http-plugin',
		label: 'HTTP',
		group: 'HTTP & explorers',
		hint: 'Application HTTP routing',
	},
	{
		id: 'postgres-plugin',
		label: 'PostgreSQL',
		group: 'Data & behavior',
		hint: 'Required database adapter',
	},
	{
		id: 'rest-plugin',
		label: 'REST',
		group: 'HTTP & explorers',
		hint: 'REST data API',
	},
	{
		id: 'roles-plugin',
		label: 'Roles',
		group: 'Security',
		hint: 'Role identity; no automatic permission',
	},
	{
		id: 'hono-server-plugin',
		label: 'Hono server',
		group: 'HTTP & explorers',
		hint: 'Managed local HTTP server',
	},
	{
		id: 'soft-delete-plugin',
		label: 'Soft Delete',
		group: 'Data & behavior',
		hint: 'Recoverable records',
	},
	{
		id: 'validation-plugin',
		label: 'Validation',
		group: 'Data & behavior',
		hint: 'Application field validators',
	},
] as const

export type PluginId = (typeof officialPlugins)[number]['id']
export type ApiId = 'rest' | 'graphql'

export const pluginGroups = [
	'Data & behavior',
	'Security',
	'HTTP & explorers',
] as const

export const isPluginId = (value: string): value is PluginId =>
	officialPlugins.some((plugin) => plugin.id === value)

/**
 * Shipped official plugins the initializer deliberately does not offer, with
 * the reason given to callers who request one. A plugin returns to
 * `officialPlugins` once a generated application can actually use it.
 */
export const withheldPlugins: ReadonlyMap<string, string> = new Map([
	['pg-vector-plugin', 'it does not persist vector fields'],
])

// Each dependency is a real packaged plugin; GraphQL alone remains network-independent.
const pluginDependencies: Readonly<
	Partial<Record<PluginId, readonly PluginId[]>>
> = {
	'hono-server-plugin': ['http-plugin'],
	'rest-plugin': ['http-plugin', 'hono-server-plugin'],
	'graphql-yoga-plugin': [
		'graphql-plugin',
		'http-plugin',
		'hono-server-plugin',
	],
	'graphql-explorer-plugin': ['graphql-yoga-plugin'],
}

const apiPlugins: Readonly<Record<ApiId, PluginId>> = {
	rest: 'rest-plugin',
	graphql: 'graphql-yoga-plugin',
}

/** PostgreSQL, API and requested plugins plus every transitive prerequisite. */
export const selectedPluginIds = (
	apis: readonly ApiId[],
	requested: readonly PluginId[] = [],
): ReadonlySet<PluginId> => {
	const selected = new Set<PluginId>([
		'postgres-plugin',
		...requested,
		...apis.map((api) => apiPlugins[api]),
	])
	// A Set also visits values added while iterating, so one pass is a closure.
	for (const id of selected)
		for (const dependency of pluginDependencies[id] ?? [])
			selected.add(dependency)
	return selected
}
