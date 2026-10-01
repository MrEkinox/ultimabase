import type { PluginId } from './catalog.js'
import type { InitializerPlan } from './config.js'
import { privateSchemaApiOptions } from './api-template.js'

const securityIds: readonly PluginId[] = [
	'access-plugin',
	'acl-permissions-plugin',
	'password-auth-plugin',
	'roles-plugin',
]

const has = (plan: InitializerPlan, id: PluginId): boolean =>
	plan.plugins.includes(id)

export const needsMasterKey = (plan: InitializerPlan): boolean =>
	securityIds.some((id) => has(plan, id))

/** These declarations stay in application source; plugin imports alone grant nothing. */
export const securitySchemaImports = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'access-plugin')
		? ["import { accessPlugin } from '@ultimabase/access-plugin'"]
		: []),
	...(has(plan, 'acl-permissions-plugin')
		? ["import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'"]
		: []),
	...(has(plan, 'password-auth-plugin')
		? ["import { PasswordUserSchema } from '@ultimabase/password-auth-plugin'"]
		: []),
	...(has(plan, 'roles-plugin')
		? ["import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'"]
		: []),
	...(has(plan, 'roles-plugin') && has(plan, 'password-auth-plugin')
		? ["import { passwordPrincipal } from '@ultimabase/password-auth-plugin'"]
		: []),
]

/** Installs security plugins once on the schema-owning application factory. */
export const securitySchemaPluginEntries = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'access-plugin')
		? [
				has(plan, 'password-auth-plugin')
					? 'accessPlugin({ default: { read: true } })'
					: 'accessPlugin()',
			]
		: []),
	...(has(plan, 'acl-permissions-plugin') ? ['aclPlugin()'] : []),
	...(has(plan, 'roles-plugin') ? ['rolesPlugin()'] : []),
]

export const securitySchemaDeclarations = (plan: InitializerPlan): string => {
	const declarations: string[] = []
	if (has(plan, 'password-auth-plugin')) {
		declarations.push(`// Password Auth claims this exact application User schema; credentials stay in private storage.
export const AppUser = PasswordUserSchema.define(SchemaApplication.Schema, {
  className: 'User',
  fields: (f) => ({ displayName: f.string() }),
})`)
	}
	if (has(plan, 'roles-plugin') && !has(plan, 'password-auth-plugin')) {
		declarations.push(`// A local member model keeps Roles useful without installing authentication.
export const Member = SchemaApplication.Schema.define({
  className: 'Member',
${privateSchemaApiOptions(plan)}
  fields: (f) => ({ name: f.string({ required: true }) }),
})`)
	}
	if (has(plan, 'roles-plugin')) {
		const member = has(plan, 'password-auth-plugin') ? 'AppUser' : 'Member'
		const resolveCurrent = has(plan, 'password-auth-plugin')
			? ',\n    resolveCurrent: ({ context }) => context.getValue(passwordPrincipal)?.user'
			: ''
		declarations.push(`// Role membership is data, not an authorization grant by itself.
export const AppRole = RoleSchema.define(SchemaApplication.Schema, {
  className: 'Role',
${privateSchemaApiOptions(plan)}
  members: { schema: ${member}${resolveCurrent} },
  deletion: { references: 'fail' },
  fields: (f) => ({ description: f.string() }),
})`)
	}
	return declarations.join('\n\n')
}

export const taskSecurityOptions = (plan: InitializerPlan): string =>
	[
		...(has(plan, 'access-plugin')
			? [
					`  // Deny ordinary requests; the local demonstration uses audited Master access.
  access: { read: false, create: false, update: false, delete: false },`,
				]
			: []),
		...(has(plan, 'acl-permissions-plugin')
			? [
					`  // An empty ACL grants no read, update, or delete rights.
  acl: {
    default: () => new ACL(),
    resolveInput: ({ currentAcl, inputAcl }) => inputAcl ?? currentAcl ?? new ACL(),
  },`,
				]
			: []),
	].join('\n')

export const securityApplicationImports = (
	plan: InitializerPlan,
): readonly string[] => [
	...(needsMasterKey(plan)
		? ["import { MasterAuthority } from '@ultimabase/core'"]
		: []),
	...(has(plan, 'access-plugin') && has(plan, 'password-auth-plugin')
		? [
				"import { provideAccessContributions, schemaAccess } from '@ultimabase/access-plugin'",
			]
		: []),
	...(has(plan, 'password-auth-plugin')
		? ["import { passwordAuthPlugin } from '@ultimabase/password-auth-plugin'"]
		: []),
	...(has(plan, 'access-plugin') && has(plan, 'password-auth-plugin')
		? [
				"import { plugin } from '@ultimabase/core'",
				"import { passwordPrincipal } from '@ultimabase/password-auth-plugin'",
			]
		: []),
]

export const securitySchemaNames = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'password-auth-plugin') ? ['AppUser'] : []),
	...(has(plan, 'roles-plugin') && !has(plan, 'password-auth-plugin')
		? ['Member']
		: []),
	...(has(plan, 'roles-plugin') ? ['AppRole'] : []),
]

export const securityPluginEntries = (
	plan: InitializerPlan,
): readonly string[] => [
	...(has(plan, 'access-plugin') && has(plan, 'password-auth-plugin')
		? ['profilePolicy']
		: []),
	...(has(plan, 'password-auth-plugin')
		? ['passwordAuthPlugin({ user: AppUser })']
		: []),
]

/** Plugin-owned and claimed schemas use attributed contributions instead of inline Access. */
export const securityPolicySource = (plan: InitializerPlan): string =>
	has(plan, 'access-plugin') && has(plan, 'password-auth-plugin')
		? `// Allow only the current session's profile; all other schema reads remain denied.
const profilePolicy = plugin({
  id: 'app.profile-policy',
  version: '1.0.0',
  core: '^0.0.0',
  peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
  permissions: { 'runtime:constrain': 'Restrict reads to the current session owner.' },
  contributions: [provideAccessContributions('own-profile', ({ schemas }) =>
      schemas.values().map((schema) => schema === AppUser
        ? schemaAccess(AppUser, {
            read: {
              where: ({ context, where }) => {
                const principal = context.getValue(passwordPrincipal)
                return where.in('id', principal === undefined ? [] : [principal.user.id])
              },
            },
          })
        : schemaAccess(schema, { read: false })),
    )],
})
`
		: ''

export const securityMasterSource = (plan: InitializerPlan): string =>
	needsMasterKey(plan)
		? `const masterKey = process.env.ULTIMABASE_MASTER_KEY
if (masterKey === undefined || masterKey === '<generate-a-random-local-key>') {
  throw new TypeError('Set ULTIMABASE_MASTER_KEY to a private random value')
}

`
		: ''

export const securityApplicationOption = (plan: InitializerPlan): string =>
	needsMasterKey(plan)
		? `  masterAuthority: new MasterAuthority({
    keys: [{ id: 'local', value: masterKey }],
    onUse: (event) => {
      // Replace this development console record with a durable audit sink before deployment.
      console.info('Master authority used', { kind: event.kind, keyId: event.keyId, requestId: event.requestId })
    },
  }),
`
		: ''

export const securityDependencies = (
	plan: InitializerPlan,
): Readonly<Record<string, string>> => ({
	...(has(plan, 'access-plugin')
		? { '@ultimabase/access-plugin': '^0.0.0' }
		: {}),
	...(has(plan, 'acl-permissions-plugin')
		? { '@ultimabase/acl-permissions-plugin': '^0.0.0' }
		: {}),
	...(has(plan, 'password-auth-plugin')
		? { '@ultimabase/password-auth-plugin': '^0.0.0' }
		: {}),
	...(has(plan, 'roles-plugin')
		? { '@ultimabase/roles-plugin': '^0.0.0' }
		: {}),
})

export const securityReadmeNotes = (
	plan: InitializerPlan,
): readonly string[] => [
	...(needsMasterKey(plan)
		? [
				'This development project uses an ignored local Master key for trusted server-side examples. Never expose it through HTTP or a browser; replace the console audit with durable auditing before deployment.',
			]
		: []),
	...(has(plan, 'password-auth-plugin')
		? [
				'Password Auth claims the configured application User schema and owns private credentials and sessions. A session identifies a caller; it does not grant Task access or publish authentication operations.',
			]
		: []),
	...(has(plan, 'password-auth-plugin') && has(plan, 'access-plugin')
		? [
				'The generated User read policy exposes only the current session owner. Sign-up, login, and refresh require this readable profile; other User operations still use Access defaults.',
			]
		: []),
	...(has(plan, 'access-plugin')
		? [
				'Access denies ordinary operations except the explicitly configured own-profile read policy when Password Auth is selected. The Task example explicitly denies ordinary CRUD; its local write uses audited Master authority.',
			]
		: []),
	...(has(plan, 'acl-permissions-plugin')
		? [
				'An empty Task ACL denies ordinary reads, updates, and deletes. ACL alone does not deny creation; add Access before exposing a create route.',
			]
		: []),
	...(has(plan, 'roles-plugin')
		? [
				'Roles provide membership identities only. This starter creates no role grants or public role routes.',
			]
		: []),
]
