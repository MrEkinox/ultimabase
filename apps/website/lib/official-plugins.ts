export const officialPluginCatalog = Object.freeze({
	'access-plugin': 'Security policy engine',
	'acl-permissions-plugin': 'Object-level permissions',
	'apollo-sandbox-plugin': 'GraphQL browser explorer',
	'graphiql-plugin': 'GraphQL browser explorer',
	'graphql-plugin': 'Network-independent GraphQL schema',
	'graphql-yoga-plugin': 'GraphQL over HTTP adapter',
	'hono-server-plugin': 'Node.js Hono server provider',
	'hooks-plugin': 'Application lifecycle behavior',
	'http-plugin': 'Fetch-compatible application boundary',
	'password-auth-plugin': 'Username, password, and session identity',
	'pg-vector-plugin': 'PostgreSQL vector field declaration',
	'postgres-plugin': 'PostgreSQL database adapter',
	'rest-plugin': 'REST v1 transport',
	'roles-plugin': 'Schema-backed roles',
	'soft-delete-plugin': 'Tombstone lifecycle',
	'validation-plugin': 'Standard Schema field validation',
} as const)

export type OfficialPluginDirectory = keyof typeof officialPluginCatalog
