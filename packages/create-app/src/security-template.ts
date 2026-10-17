import {
	indentRest,
	pluginImports,
	privateSchemaApiOptions,
} from './api-template.js'
import { hasPlugin as has, included, type InitializerPlan } from './config.js'
import type { NamedImport } from './source.js'

// Sign-up needs no Master: authPlugin elevates with its own privilege
// (ADR-0326), and the prototype Access opening allows the Task seed in
// development (ADR-0327). An empty ACL still hides the seed from its check.
// In-process Master needs no key (ADR-0340).
export const needsMaster = (plan: InitializerPlan): boolean =>
	has(plan, 'acl-permissions-plugin') || has(plan, 'roles-plugin')

const hasAuth = (plan: InitializerPlan): boolean => has(plan, 'auth-plugin')

/** Access with authentication gives the User an own-profile read rule. */
const hasProfilePolicy = (plan: InitializerPlan): boolean =>
	has(plan, 'access-plugin') && hasAuth(plan)

/** Roles without authentication get a local member model. */
const hasMember = (plan: InitializerPlan): boolean =>
	has(plan, 'roles-plugin') && !hasAuth(plan)

/** The factory imports of the security plugins; importing alone grants nothing. */
export const securityPluginImports = (plan: InitializerPlan): NamedImport[] => [
	...pluginImports(plan, [
		['access-plugin', 'accessPlugin'],
		['acl-permissions-plugin', 'aclPlugin'],
		['auth-plugin', 'authPlugin'],
		['roles-plugin', 'rolesPlugin'],
	]),
	...included<NamedImport>([
		[hasAuth(plan), ['@ultimabase/auth-password', 'password']],
	]),
]

/**
 * The prototype opening (ADR-0327): operations without a rule are open
 * outside production; `start()` refuses production until rules replace it.
 */
const prototypeAccess = `// Prototype: operations without an Access rule are open outside production.
// Production refuses to start until you write .with({ access }) rules and
// remove this opening.
accessPlugin({ allowWithoutRule: { all: 'development' } })`

/** Installs security plugins once on the schema-owning application factory. */
export const securitySchemaPluginEntries = (plan: InitializerPlan): string[] =>
	included([
		[has(plan, 'access-plugin'), prototypeAccess],
		[has(plan, 'acl-permissions-plugin'), 'aclPlugin()'],
		[has(plan, 'roles-plugin'), 'rolesPlugin()'],
		[
			hasAuth(plan),
			"authPlugin({ methods: [password({ identifier: 'email' })] })",
		],
	])

// The current member is the request principal resolved by Core (ADR-0304).
const roleMembers = (
	plan: InitializerPlan,
): { readonly file: string; readonly name: string } =>
	hasAuth(plan)
		? { file: 'user', name: 'AppUser' }
		: { file: 'member', name: 'Member' }

/** One generated schema module: its file name under `src/schemas/`. */
export interface SchemaFile {
	/** The file name without extension, such as `user`. */
	readonly file: string
	/** The exported schema. */
	readonly name: string
	/** Package imports of the declaration. */
	readonly packageImports: readonly NamedImport[]
	/** The declaration, without imports. */
	readonly declaration: string
	/** Other schema modules it imports, as [file, name]. */
	readonly schemaImports: readonly (readonly [string, string])[]
}

/** The security schemas, one module each under `src/schemas/`. */
export const securitySchemaFiles = (plan: InitializerPlan): SchemaFile[] =>
	included<SchemaFile>([
		[
			hasAuth(plan),
			{
				file: 'user',
				name: 'AppUser',
				packageImports: hasProfilePolicy(plan)
					? [['@ultimabase/access-plugin', 'isSelf']]
					: [],
				schemaImports: [],
				declaration: `// The User of authPlugin: password() adds a unique email; credentials and
// sessions stay in private storage.
export const AppUser = App.UserSchema.define({
  className: 'User',
  fields: (f) => ({ displayName: f.string() }),
})${withRules([
					...(hasProfilePolicy(plan)
						? [
								{
									comment:
										'Each user reads only their own profile; writes stay with authPlugin.',
									entry: [
										'access: {',
										'  read: isSelf,',
										'  create: false,',
										'  update: false,',
										'  upsert: false,',
										'  delete: false,',
										'}',
									].join('\n'),
								},
							]
						: []),
					...privateRules(plan),
				])}`,
			},
		],
		[
			hasMember(plan),
			{
				file: 'member',
				name: 'Member',
				packageImports: [],
				schemaImports: [],
				declaration: `// A local member model keeps Roles useful without installing authentication.
export const Member = App.Schema.define({
  className: 'Member',
  fields: (f) => ({ name: f.string({ required: true }) }),
})${withRules(privateRules(plan))}`,
			},
		],
		[
			has(plan, 'roles-plugin'),
			{
				file: 'role',
				name: 'AppRole',
				packageImports: [],
				schemaImports: [[roleMembers(plan).file, roleMembers(plan).name]],
				declaration: `// Role membership is data, not an authorization grant by itself.
export const AppRole = App.RoleSchema.define({
${[
	"  className: 'Role',",
	`  members: () => ${roleMembers(plan).name},`,
	'  fields: (f) => ({ description: f.string() }),',
].join('\n')}
})${withRules([{ entry: "roles: { deletion: 'fail' }" }, ...privateRules(plan)])}`,
			},
		],
	])

/** One entry of `.with({ … })`, such as `rest: false`. */
interface RuleEntry {
	/** A comment line written above the entry. */
	readonly comment?: string
	/** `key: value`, possibly over several lines. */
	readonly entry: string
}

const privateRules = (plan: InitializerPlan): RuleEntry[] =>
	privateSchemaApiOptions(plan).map((entry) => ({ entry }))

/**
 * Renders the final `.with({ … })` of a declaration closed by `})` as
 * Prettier prints it; a declaration without rules stays an unfinished
 * `define(...)` (ADR-0297, ADR-0339).
 */
const withRules = (entries: readonly RuleEntry[]): string => {
	if (entries.length === 0) return ''
	if (
		entries.every(
			({ comment, entry }) => comment === undefined && !entry.includes('\n'),
		)
	) {
		const compact = `.with({ ${entries.map(({ entry }) => entry).join(', ')} })`
		if (`})${compact}`.length <= 80) return compact
	}
	const lines = entries.map(
		({ comment, entry }) =>
			`${comment === undefined ? '' : `  // ${comment}\n`}  ${indentRest(entry, 2)},`,
	)
	return `.with({\n${lines.join('\n')}\n})`
}

/** `acl: true` in `define` requires `.with({ acl: { default } })` (ADR-0339). */
export const taskRulesChain = (plan: InitializerPlan): string =>
	has(plan, 'acl-permissions-plugin')
		? withRules([
				{
					comment: 'An empty ACL grants no read, update, or delete rights.',
					entry: 'acl: { default: new ACL() }',
				},
			])
		: ''

export const securityApplicationImports = (
	plan: InitializerPlan,
): NamedImport[] =>
	included<NamedImport>([
		[needsMaster(plan), ['@ultimabase/core', 'MasterAuthority']],
	])

export const securityApplicationOption = (plan: InitializerPlan): string =>
	needsMaster(plan)
		? `  // Trusted server code runs useMasterKey: true in process; every use is audited.
  masterAuthority: new MasterAuthority({
    onUse: (event) => {
      // Replace this development console record with a durable audit sink before deployment.
      console.info('Master authority used', {
        kind: event.kind,
        keyId: event.keyId,
        requestId: event.requestId,
      })
    },
  }),`
		: ''

export const securityReadmeNotes = (plan: InitializerPlan): string[] =>
	included([
		[
			needsMaster(plan),
			'Trusted server code (the Task seed) uses Master in process with `useMasterKey: true`: it needs no key, nothing exposes it over HTTP, and `onUse` audits every use. Replace the console audit with durable auditing before deployment.',
		],
		[
			hasAuth(plan),
			'Authentication (`authPlugin` with `password()`) adds the User schema `AppUser` and keeps credentials and sessions in private storage. A session identifies a caller; it does not grant Task access.',
		],
		[
			hasProfilePolicy(plan),
			'The generated User rules expose only the current session owner and deny direct User writes. Sign-up, login, and refresh require this readable profile.',
		],
		[
			has(plan, 'access-plugin'),
			"Access starts as a prototype: `allowWithoutRule: { all: 'development' }` opens every operation without a rule outside production, with a warning at start. With `NODE_ENV=production` the application refuses to start until you write `.with({ access: { … } })` rules for your schemas and remove that opening. Mutation results obey the read rules: a client that may write a row it cannot read requests `select: { id: true }`.",
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
