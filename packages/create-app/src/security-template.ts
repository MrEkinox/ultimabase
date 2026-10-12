import { pluginImports, privateSchemaApiOptions } from './api-template.js'
import { hasPlugin as has, included, type InitializerPlan } from './config.js'
import type { NamedImport } from './source.js'

// Sign-up needs no Master key: authPlugin elevates with its own privilege (ADR-0326).
export const needsMasterKey = (plan: InitializerPlan): boolean =>
	has(plan, 'access-plugin') ||
	has(plan, 'acl-permissions-plugin') ||
	has(plan, 'roles-plugin')

const hasAuth = (plan: InitializerPlan): boolean => has(plan, 'auth-plugin')

/** Access with authentication gives the User an own-profile read rule. */
const hasProfilePolicy = (plan: InitializerPlan): boolean =>
	has(plan, 'access-plugin') && hasAuth(plan)

/** Roles without authentication get a local member model. */
const hasMember = (plan: InitializerPlan): boolean =>
	has(plan, 'roles-plugin') && !hasAuth(plan)

/** These declarations stay in application source; plugin imports alone grant nothing. */
export const securitySchemaImports = (plan: InitializerPlan): NamedImport[] => [
	...pluginImports(plan, [
		['access-plugin', 'accessPlugin'],
		['acl-permissions-plugin', 'ACL, aclPlugin'],
		['auth-plugin', 'authPlugin'],
		['roles-plugin', 'rolesPlugin'],
	]),
	...included<NamedImport>([
		[hasAuth(plan), ['@ultimabase/auth-password', 'password']],
	]),
]

/** Installs security plugins once on the schema-owning application factory. */
export const securitySchemaPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[has(plan, 'access-plugin'), 'accessPlugin()'],
		[has(plan, 'acl-permissions-plugin'), 'aclPlugin()'],
		[has(plan, 'roles-plugin'), 'rolesPlugin()'],
		[
			hasAuth(plan),
			"authPlugin({ methods: [password({ identifier: 'email' })] })",
		],
	])

// The current member is the request principal resolved by Core (ADR-0304).
const roleMembers = (plan: InitializerPlan): string =>
	hasAuth(plan) ? 'AppUser' : 'Member'

export const securitySchemaDeclarations = (plan: InitializerPlan): string =>
	included([
		[
			hasAuth(plan),
			`// The User of authPlugin: password() adds a unique email; credentials and
// sessions stay in private storage.
export const AppUser = SchemaApplication.UserSchema.define({
  className: 'User',
  fields: (f) => ({ displayName: f.string() }),
})${withRules([
				...(hasProfilePolicy(plan)
					? [
							'// Each user reads only their own profile.',
							"access: { read: ({ principal, where }) => where.in('id', principal === undefined ? [] : [principal.id]) },",
						]
					: []),
				...privateSchemaApiOptions(plan).map((line) => line.trim()),
			])}`,
		],
		[
			hasMember(plan),
			`// A local member model keeps Roles useful without installing authentication.
export const Member = SchemaApplication.Schema.define({
  className: 'Member',
  fields: (f) => ({ name: f.string({ required: true }) }),
})${withRules(privateSchemaApiOptions(plan).map((line) => line.trim()))}`,
		],
		[
			has(plan, 'roles-plugin'),
			`// Role membership is data, not an authorization grant by itself.
export const AppRole = SchemaApplication.RoleSchema.define({
${[
	"  className: 'Role',",
	`  members: () => ${roleMembers(plan)},`,
	"  deletion: 'fail',",
	'  fields: (f) => ({ description: f.string() }),',
].join('\n')}
})${withRules(privateSchemaApiOptions(plan).map((line) => line.trim()))}`,
		],
	]).join('\n\n')

/**
 * Role schemas are complete declarations (`.with(...)`), and an application
 * mixing them with unfinished `define(...)` calls cannot name its own type in
 * `Register`. With Roles or ACL, the Task rules therefore go in `.with(...)`.
 */
const finishesTask = (plan: InitializerPlan): boolean =>
	has(plan, 'roles-plugin') || has(plan, 'acl-permissions-plugin')

const taskAccessRule = [
	'// Deny ordinary requests; the local demonstration uses audited Master access.',
	'access: { read: false, create: false, update: false, delete: false },',
]

/** Renders the final `.with(...)` of a declaration from its rule lines. */
const withRules = (rules: readonly string[]): string =>
	rules.length === 0
		? '.with({})'
		: `.with({\n${rules.map((rule) => `  ${rule}`).join('\n')}\n})`

/** Old-form Task options, kept in `define(...)` while the Task stays unfinished. */
export const taskSecurityOptions = (plan: InitializerPlan): string =>
	has(plan, 'access-plugin') && !finishesTask(plan)
		? taskAccessRule.map((line) => `  ${line}`).join('\n')
		: ''

/** ACL is added by `.acl()` and configured in `.with({ acl })` (ADR-0321). */
export const taskRulesChain = (plan: InitializerPlan): string => {
	if (!finishesTask(plan)) return ''
	const rules = [
		...(has(plan, 'access-plugin') ? taskAccessRule : []),
		...(has(plan, 'acl-permissions-plugin')
			? [
					'// An empty ACL grants no read, update, or delete rights.',
					'acl: { default: new ACL() },',
				]
			: []),
	]
	return `${has(plan, 'acl-permissions-plugin') ? '.acl()' : ''}${withRules(rules)}`
}

export const securityApplicationImports = (
	plan: InitializerPlan,
): NamedImport[] =>
	included<NamedImport>([
		[needsMasterKey(plan), ['@ultimabase/core', 'MasterAuthority']],
	])

export const securitySchemaNames = (plan: InitializerPlan): string[] =>
	included([
		[hasAuth(plan), 'AppUser'],
		[hasMember(plan), 'Member'],
		[has(plan, 'roles-plugin'), 'AppRole'],
	])

export const securityMasterSource = (plan: InitializerPlan): string =>
	needsMasterKey(plan)
		? `const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined || masterKey === '<generate-a-random-local-key>') {
  throw new TypeError('Set ULTIMABASE_MASTER_KEY to a private random value')
}`
		: ''

export const securityApplicationOption = (plan: InitializerPlan): string =>
	needsMasterKey(plan)
		? `  masterAuthority: new MasterAuthority({
    keys: [{ id: 'local', value: masterKey }],
    onUse: (event) => {
      // Replace this development console record with a durable audit sink before deployment.
      console.info('Master authority used', { kind: event.kind, keyId: event.keyId, requestId: event.requestId })
    },
  }),`
		: ''

export const securityReadmeNotes = (plan: InitializerPlan): string[] =>
	included([
		[
			needsMasterKey(plan),
			'This development project uses an ignored local Master key for trusted server-side examples. Never expose it through HTTP or a browser; replace the console audit with durable auditing before deployment.',
		],
		[
			hasAuth(plan),
			'Authentication (`authPlugin` with `password()`) adds the User schema `AppUser` and keeps credentials and sessions in private storage. A session identifies a caller; it does not grant Task access.',
		],
		[
			hasProfilePolicy(plan),
			'The generated User read rule exposes only the current session owner. Sign-up, login, and refresh require this readable profile; other User operations stay denied.',
		],
		[
			has(plan, 'access-plugin'),
			'Access denies every operation without a rule. The Task example explicitly denies ordinary CRUD; its local write uses audited Master authority. Mutation results obey the read rules: a client that may write a row it cannot read requests `select: { id: true }`.',
		],
		[
			has(plan, 'acl-permissions-plugin'),
			'An empty Task ACL denies ordinary reads, updates, and deletes. ACL alone does not deny creation; add Access before exposing a create route.',
		],
		[
			has(plan, 'roles-plugin'),
			'Roles provide membership identities only. This starter creates no role grants or public role routes.',
		],
	])
