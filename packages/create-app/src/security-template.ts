import { pluginImports, privateSchemaApiOptions } from './api-template.js'
import { hasPlugin as has, included, type InitializerPlan } from './config.js'
import type { NamedImport } from './source.js'

export const needsMasterKey = (plan: InitializerPlan): boolean =>
	has(plan, 'access-plugin') ||
	has(plan, 'acl-permissions-plugin') ||
	has(plan, 'password-auth-plugin') ||
	has(plan, 'roles-plugin')

const hasAuth = (plan: InitializerPlan): boolean =>
	has(plan, 'password-auth-plugin')

/** Access with Password Auth needs an own-profile read policy for its operations. */
const hasProfilePolicy = (plan: InitializerPlan): boolean =>
	has(plan, 'access-plugin') && hasAuth(plan)

/** Roles without Password Auth get a local member model. */
const hasMember = (plan: InitializerPlan): boolean =>
	has(plan, 'roles-plugin') && !hasAuth(plan)

/** These declarations stay in application source; plugin imports alone grant nothing. */
export const securitySchemaImports = (plan: InitializerPlan): NamedImport[] => [
	...pluginImports(plan, [
		['access-plugin', 'accessPlugin'],
		['acl-permissions-plugin', 'ACL, aclPlugin'],
		['password-auth-plugin', 'PasswordUserSchema'],
		['roles-plugin', 'RoleSchema, rolesPlugin'],
	]),
]

/** Installs security plugins once on the schema-owning application factory. */
export const securitySchemaPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[
			has(plan, 'access-plugin'),
			hasAuth(plan)
				? 'accessPlugin({ allowWithoutRule: { read: true } })'
				: 'accessPlugin()',
		],
		[has(plan, 'acl-permissions-plugin'), 'aclPlugin()'],
		[has(plan, 'roles-plugin'), 'rolesPlugin()'],
	])

// The current member is the request principal resolved by Core (ADR-0304).
const roleMembers = (plan: InitializerPlan): string =>
	hasAuth(plan) ? 'AppUser' : 'Member'

export const securitySchemaDeclarations = (plan: InitializerPlan): string =>
	included([
		[
			hasAuth(plan),
			`// Password Auth claims this exact application User schema; credentials stay in private storage.
export const AppUser = PasswordUserSchema.define(SchemaApplication.Schema, {
  className: 'User',
  fields: (f) => ({ displayName: f.string() }),
})`,
		],
		[
			hasMember(plan),
			`// A local member model keeps Roles useful without installing authentication.
export const Member = SchemaApplication.Schema.define({
${[
	"  className: 'Member',",
	...privateSchemaApiOptions(plan),
	'  fields: (f) => ({ name: f.string({ required: true }) }),',
].join('\n')}
})`,
		],
		[
			has(plan, 'roles-plugin'),
			`// Role membership is data, not an authorization grant by itself.
export const AppRole = RoleSchema.define(SchemaApplication.Schema, {
${[
	"  className: 'Role',",
	...privateSchemaApiOptions(plan),
	`  members: { schema: ${roleMembers(plan)} },`,
	"  deletion: { references: 'fail' },",
	'  fields: (f) => ({ description: f.string() }),',
].join('\n')}
})`,
		],
	]).join('\n\n')

export const taskSecurityOptions = (plan: InitializerPlan): string =>
	included([
		[
			has(plan, 'access-plugin'),
			`  // Deny ordinary requests; the local demonstration uses audited Master access.
  access: { read: false, create: false, update: false, delete: false },`,
		],
		[
			has(plan, 'acl-permissions-plugin'),
			`  // An empty ACL grants no read, update, or delete rights.
  acl: {
    default: () => new ACL(),
    resolveInput: ({ currentAcl, inputAcl }) => inputAcl ?? currentAcl ?? new ACL(),
  },`,
		],
	]).join('\n')

export const securityApplicationImports = (
	plan: InitializerPlan,
): NamedImport[] =>
	included<NamedImport>([
		[needsMasterKey(plan), ['@ultimabase/core', 'MasterAuthority']],
		[
			hasProfilePolicy(plan),
			['@ultimabase/access-plugin', 'provideAccessContributions, schemaAccess'],
		],
		[hasAuth(plan), ['@ultimabase/password-auth-plugin', 'passwordAuthPlugin']],
		[hasProfilePolicy(plan), ['@ultimabase/core/plugin', 'plugin']],
	])

export const securitySchemaNames = (plan: InitializerPlan): string[] =>
	included([
		[hasAuth(plan), 'AppUser'],
		[hasMember(plan), 'Member'],
		[has(plan, 'roles-plugin'), 'AppRole'],
	])

export const securityPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[hasProfilePolicy(plan), 'profilePolicy'],
		[hasAuth(plan), 'passwordAuthPlugin({ user: AppUser })'],
	])

/** Plugin-owned and claimed schemas use attributed contributions instead of inline Access. */
export const securityPolicySource = (plan: InitializerPlan): string =>
	hasProfilePolicy(plan)
		? `// Allow only the current session's profile; all other schema reads remain denied.
const profilePolicy = plugin({
  id: 'app.profile-policy',
  version: '1.0.0',
  core: '^0.0.0',
  peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
  contributions: [provideAccessContributions('own-profile', ({ schemas }) =>
      schemas.values().map((schema) => schema === AppUser
        ? schemaAccess(AppUser, {
            read: ({ principal, where }) =>
              where.in('id', principal === undefined ? [] : [principal.id]),
          })
        : schemaAccess(schema, { read: false })),
    )],
})`
		: ''

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
			'Password Auth claims the configured application User schema and owns private credentials and sessions. A session identifies a caller; it does not grant Task access or publish authentication operations.',
		],
		[
			hasProfilePolicy(plan),
			'The generated User read policy exposes only the current session owner. Sign-up, login, and refresh require this readable profile; other User operations stay denied unless `allowWithoutRule` opens them.',
		],
		[
			has(plan, 'access-plugin'),
			'Access denies ordinary operations except the explicitly configured own-profile read policy when Password Auth is selected. The Task example explicitly denies ordinary CRUD; its local write uses audited Master authority. Mutation results obey the read rules: a client that may write a row it cannot read requests `select: { id: true }`.',
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
