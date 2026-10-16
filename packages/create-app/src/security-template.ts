import {
	indentRest,
	pluginImports,
	privateSchemaApiOptions,
} from './api-template.js'
import { hasPlugin as has, included, type InitializerPlan } from './config.js'
import type { NamedImport } from './source.js'

// Sign-up needs no Master key: authPlugin elevates with its own privilege
// (ADR-0326), and the prototype Access opening allows the Task seed in
// development (ADR-0327). An empty ACL still hides the seed from its check.
export const needsMasterKey = (plan: InitializerPlan): boolean =>
	has(plan, 'acl-permissions-plugin') || has(plan, 'roles-plugin')

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
		[
			'acl-permissions-plugin',
			plan.starter === 'task' ? 'ACL, aclPlugin' : 'aclPlugin',
		],
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
// Production refuses to start until you write plugins.access(...) rules and
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
							{
								comment:
									'Each user reads only their own profile; writes stay with authPlugin.',
								call: [
									'access({',
									'  read: ({ principal, where }) =>',
									"    where.in('id', principal === undefined ? [] : [principal.id]),",
									'  create: false,',
									'  update: false,',
									'  upsert: false,',
									'  delete: false,',
									'})',
								].join('\n'),
							},
						]
					: []),
				...privateRules(plan),
			])}`,
		],
		[
			hasMember(plan),
			`// A local member model keeps Roles useful without installing authentication.
export const Member = SchemaApplication.Schema.define({
  className: 'Member',
  fields: (f) => ({ name: f.string({ required: true }) }),
})${withRules(privateRules(plan))}`,
		],
		[
			has(plan, 'roles-plugin'),
			`// Role membership is data, not an authorization grant by itself.
export const AppRole = SchemaApplication.RoleSchema.define({
${[
	"  className: 'Role',",
	`  members: () => ${roleMembers(plan)},`,
	'  fields: (f) => ({ description: f.string() }),',
].join('\n')}
})${withRules([{ call: "roles({ deletion: 'fail' })" }, ...privateRules(plan)])}`,
		],
	]).join('\n\n')

/** One call of `.with((plugins) => …)`, such as `rest(false)`. */
interface RuleCall {
	/** A comment line written above the call. */
	readonly comment?: string
	readonly call: string
}

const privateRules = (plan: InitializerPlan): RuleCall[] =>
	privateSchemaApiOptions(plan).map((call) => ({ call }))

/**
 * Renders the final `.with((plugins) => …)` of a declaration closed by `})`
 * as Prettier prints it; a declaration without rules stays an unfinished
 * `define(...)` (ADR-0297, ADR-0339).
 */
const withRules = (calls: readonly RuleCall[]): string => {
	if (calls.length === 0) return ''
	const chain = calls.map(({ call }) => `.${call}`).join('')
	if (
		calls.every(
			({ call, comment }) => comment === undefined && !call.includes('\n'),
		)
	) {
		const compact = `.with((plugins) => plugins${chain})`
		if (`})${compact}`.length <= 80) return compact
		if (`  plugins${chain},`.length <= 80) {
			return `.with((plugins) =>\n  plugins${chain},\n)`
		}
	}
	const lines = calls.map(
		({ call, comment }) =>
			`${comment === undefined ? '' : `\n    // ${comment}`}\n    .${indentRest(call, 4)}`,
	)
	return `.with((plugins) =>\n  plugins${lines.join('')},\n)`
}

/** `acl: true` in `define` requires `plugins.acl({ default })` (ADR-0339). */
export const taskRulesChain = (plan: InitializerPlan): string =>
	has(plan, 'acl-permissions-plugin')
		? withRules([
				{
					comment: 'An empty ACL grants no read, update, or delete rights.',
					call: 'acl({ default: new ACL() })',
				},
			])
		: ''

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
			needsMasterKey(plan),
			'This development project uses an ignored local Master key for trusted server-side examples. Never expose it through HTTP or a browser; replace the console audit with durable auditing before deployment.',
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
			"Access starts as a prototype: `allowWithoutRule: { all: 'development' }` opens every operation without a rule outside production, with a warning at start. With `NODE_ENV=production` the application refuses to start until you write `.with((plugins) => plugins.access({ … }))` rules for your schemas and remove that opening. Mutation results obey the read rules: a client that may write a row it cannot read requests `select: { id: true }`.",
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
