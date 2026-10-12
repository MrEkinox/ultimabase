export const officialPluginCatalog = Object.freeze({
	'access-plugin': 'Security policy engine',
	'acl-permissions-plugin': 'Object-level permissions',
	'auth-plugin': 'Users, sessions and sign-in methods such as passwords',
	'graphql-explorer-plugin': 'GraphiQL or Apollo Sandbox browser explorer',
	'graphql-plugin': 'Network-independent GraphQL schema',
	'graphql-yoga-plugin': 'GraphQL over HTTP adapter',
	'hono-server-plugin': 'Node.js Hono server provider',
	'hooks-plugin': 'Application lifecycle behavior',
	'http-plugin': 'Fetch-compatible application boundary',
	'pg-vector-plugin': 'PostgreSQL vector field declaration',
	'postgres-plugin': 'PostgreSQL database adapter',
	'rest-plugin': 'REST transport',
	'roles-plugin': 'Schema-backed roles',
	'soft-delete-plugin': 'Tombstone lifecycle',
	'validation-plugin': 'Standard Schema field validation',
} as const)

export type OfficialPluginDirectory = keyof typeof officialPluginCatalog
