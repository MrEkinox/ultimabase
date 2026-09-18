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
		id: 'apollo-sandbox-plugin',
		label: 'Apollo Sandbox',
		group: 'HTTP & explorers',
		hint: 'Development GraphQL explorer',
	},
	{
		id: 'graphiql-plugin',
		label: 'GraphiQL',
		group: 'HTTP & explorers',
		hint: 'Development GraphQL explorer',
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
		id: 'password-auth-plugin',
		label: 'Password Auth',
		group: 'Security',
		hint: 'Local passwords and sessions; no CRUD permission',
	},
	{
		id: 'pg-vector-plugin',
		label: 'PostgreSQL Vector',
		group: 'Data & behavior',
		hint: 'Logical vector values; no persisted vector search',
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
		id: 'server-hono-plugin',
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

// Each dependency is a real packaged plugin; GraphQL alone remains network-independent.
export const pluginDependencies: Readonly<
	Partial<Record<PluginId, readonly PluginId[]>>
> = {
	'rest-plugin': ['http-plugin', 'server-hono-plugin'],
	'graphql-yoga-plugin': [
		'graphql-plugin',
		'http-plugin',
		'server-hono-plugin',
	],
	'graphiql-plugin': ['graphql-yoga-plugin'],
	'apollo-sandbox-plugin': ['graphql-yoga-plugin'],
}

export const apiPlugins: Readonly<Record<ApiId, PluginId>> = {
	rest: 'rest-plugin',
	graphql: 'graphql-yoga-plugin',
}
