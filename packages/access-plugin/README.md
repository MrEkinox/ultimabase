# `@ultimabase/access-plugin`

The optional official Access engine for UltimaBase. The package owns schema and
field `access` declarations, deterministic policy compilation, diagnostics, and
protected Runtime enforcement. Importing it has no effect; an application must
configure `accessPlugin()` explicitly.

The direct field `access` option is available on stored fields, embedded object
properties, and the enclosing virtual field. It never appears on properties
inside an output descriptor: Access protects the virtual field as one logical
selectable result.

Every TypeScript block below is copied from the
[access example](../../examples/access/README.md), a small application whose
tests prove each behavior described here (ADR-0330). This one permits reads
of published articles, hides `internalNote`, and denies every mutation to
ordinary callers:

<!-- region ../../examples/access/src/schema.ts#factory,article -->

```ts
import { accessPlugin, allOf, anyOf, not } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ rest: true }),
	postgresPlugin(),
)

/** Readers see published articles only; `internalNote` never leaves the server. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({
		internalNote: field.string({ access: { read: false, write: false } }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
}).with({
	// No create, update, upsert or delete rule: they stay denied.
	access: { read: ({ where }) => where.eq('published', true) },
})
```

<!-- endregion -->

## Rules in `.with` (ADR-0297, ADR-0339)

With the declaration form of
[ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md) and
[ADR-0339](../../docs/adr/0339-define-describes-with-configures.md), schema
rules go in `.with({ access: { … } })`, typed by
`AccessRules` and contributed through `AccessSchemaRules`. Filters may cross thunk targets in both directions;
`define` rejects an `access` option.

## Public surface

The root export has three deliberate groups:

- **Application API:** `accessPlugin`, its options (`AllowWithoutRule`),
  `AccessContext`, schema and field rule types, exact plugin command and
  permission rule types, and the `anyOf`, `allOf` and `not` authoring helpers
  (`allowAll`, `denyAll`, `allOperations` and `allMutations` were removed by
  ADR-0317: `true`, `false` and `allowWithoutRule` replace them).
- **Compatible-provider contract:** `accessContributionsCapability`,
  `provideAccessContributions`, the direct and field-kind contribution
  factories, `defineFieldKindAccessTarget`, and their input or definition
  types.
- **Conformance support:** `accessDiagnosticsObserverCapability` and the
  redacted diagnostic identity, event, observer, and capability types.

The capability token remains public so a compatible engine can consume the
same versioned provider protocol. Community providers should use the public
factory and target helpers, which normalize declarations before the official
engine receives them.

Raw schema-option definitions, normalization functions, normalized declaration
storage, the unused context-narrowing helper, and Core-attributed
`OwnedAccessContribution` values are implementation details. They are
intentionally unavailable from the package root. Importing the package still
performs no registration or Runtime work.

The configured factory exposes field `access` immediately after
`accessPlugin()` is installed. Schema `access` rules in `.with` are typed against
the complete schema, its relations and the plugin commands its statics carry. A
factory without the
plugin exposes neither contract, and Runtime compilation still rejects untyped
JavaScript declarations that try to use them.

JavaScript uses the same compiled graph. An application without
`accessPlugin()` has no official Access policy stage: its direct CRUD runs
without Access rules.

Core validation, transactions, protected constraints, and anonymous or
audited-master authority remain active. Importing this package alone installs
nothing, and declaring `access` without `accessPlugin()` fails compilation.
The packed policy vertical is exercised by the
[`access-plugin-postgres.postgres.e2e.test.ts`](tests/e2e/access-plugin-postgres.postgres.e2e.test.ts)
public-package suite.

For nested singular writes, source relation `access.write` runs during initial
enforcement before any child Hook or write. It receives immutable `create`,
`connect`, `update`, `disconnect`, and `set` changes in deterministic command
order. `create` carries framework-reserved target Pointers, identity commands
carry their declared targets, and `set: []` carries an empty target
collection. Each child then evaluates its own complete Access policy as an
ordinary `createOne` or `updateOne`; relation updates additionally prove exact
visible source membership. Master bypass remains uniform across the whole
graph.

## Principal, predicates and readable results

Every rule callback receives the request `principal` resolved by Core
(`undefined` when anonymous), the policy `operation` key, the `schema` class
name and the request `context` (ADR-0304); rules never import an
authentication plugin. A Core `PolicyPredicate` such as `isAuthenticated`, or
Roles' `hasRole()`, is accepted wherever a rule returns a decision without a
filter. A predicate that throws rejects the operation; throw a `PublicError`
to tell the client why.

Notes below are private to their author; `Admin` is a Roles role:

<!-- region ../../examples/access/src/schema.ts#factory,members,note -->

```ts
import { accessPlugin, allOf, anyOf, not } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ rest: true }),
	postgresPlugin(),
)

/** The people who use the newsroom; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing. Only trusted server code changes members. */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
}).with({ roles: { ensure: ['editor', 'admin', 'muted'] } })

export const Editor = StaffRole.role('editor')
export const Admin = StaffRole.role('admin')
export const Muted = StaffRole.role('muted')

/** Private notes: members write their own, and only their author reads them. */
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
	}),
}).with({
	access: {
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('author', principal.id),
		create: {
			// Nothing is loaded before a create: `where` is a decision.
			where: isAuthenticated,
			item: ({ item, principal }) => item.author === principal?.id,
		},
		update: {
			where: ({ principal }) => principal !== undefined,
			item: ({ item, originalItem, principal }) =>
				originalItem.author === principal?.id &&
				item.author === originalItem.author,
		},
		delete: hasRole(Admin),
	},
})
```

<!-- endregion -->

Every `connect` and `set` target, in singular, nested and collection commands,
must be visible to the caller as a `one` read under every installed policy;
`disconnect` names only visible members. A hidden target fails with the same
`NOT_FOUND` as a missing one (ADR-0308). Rule filter objects accept the
equality shorthand (`where: () => ({ published: true })`, ADR-0307).

Mutation results obey the row `read` rules (ADR-0306): a write whose result
the caller cannot read, selected beyond `id`, fails with `PERMISSION_DENIED`
and rolls back; `select: { id: true }` is always allowed. Rules evaluated for
`ultimabase.can()` skip field rules: the operation carries no input or
selection (`readPolicyQuery()` marks it).

## Rules (ADR-0317)

Each operation has at most one schema rule, evaluated before any row is
loaded: `true` (every row), `false` (no row), or a function returning one of
them or a row filter. A function that may return nothing is a type error. The
`Note` above uses each form.

- `read` covers `one`, `many`, `count` and `exists`, or takes
  `{ one, many, count, exists }` with each member optional.
- Mutations (`create`, `update`, `upsert`, `delete`) also take the detailed form
  `{ where, item }`: `where` is the operation rule (a boolean decision for
  `create`, since nothing is loaded) and `item` checks each prepared draft,
  locked original or candidate.
- Request plugin commands keep their own key (`softDeleteOne`, `restoreMany`)
  with the same forms; their `input` is available to the rule.
- Plugin permissions declared on the schema (Soft Delete's `readDeleted`) take
  `true`, `false` or a predicate.
- Field rules `read: { output, where, orderBy }` and
  `write: { fill, replace, clear }` are partial: an omitted member restricts
  nothing.

## Operations without a rule: `allowWithoutRule`

Without a schema rule an operation is denied, unless `allowWithoutRule` opens
it. It replaces the former `default` option.

The example's tests start an application with each of these configurations:

<!-- region ../../examples/access/src/openings.ts#openings -->

```ts
/** Reads open, production included; native writes and commands stay denied. */
export const readOnlyAccess = () =>
	accessPlugin({ allowWithoutRule: { all: true, write: false } })

/** Reads open except counts; authenticated callers may write. */
export const memberWritesAccess = () =>
	accessPlugin({
		allowWithoutRule: { read: true, count: false, write: isAuthenticated },
	})

/** Everything open outside production; in production, `start()` fails. */
export const developmentAccess = () =>
	accessPlugin({ allowWithoutRule: { all: 'development' } })
```

<!-- endregion -->

- Keys: `all`; the groups `read` (`one`, `many`, `count`, `exists`) and `write`
  (`create`, `update`, `upsert`, `delete` and request plugin commands); each
  operation or plugin command key alone. An operation key wins over its group,
  a group over `all`, and a schema rule always wins. A plugin permission is
  opened only by its own key: `all`, `read` and `write` never include it.
- Values: `true` (open, production included), `'development'` (open outside
  production; in production `start()` fails with a message naming the
  operations, ADR-0312), a `PolicyPredicate` (no filter: it applies to every
  schema), or `false`/absent (denied). Unknown keys fail when the application
  compiles.
- After `start()`, Access logs one `warn` line per opening, production
  included, with predicate names, and one `info` line listing the schemas
  without any Access rule (ADR-0313).
- A `write` opening is an explicit policy for ADR-0294: Access is a protected
  policy, so transports never also require a public-writes acknowledgment.

Openings belong to the configured plugin instance and never mutate a schema or
another application. Compatible provider contributions run after the schema
rule or opening and combine through logical `AND`: they may narrow an allowed
operation, but cannot grant one.

Trusted master requests bypass the complete official Access policy. Therefore
`false`, callback denials, row filters, field restrictions, and openings apply
only to non-master callers. Validation, hooks, transactions, and database
constraints still execute.

## Plugin permissions

A plugin declares a named schema permission through Core
(`provideSchemaPermissions`, or `permissions` in a `definePlugin` shape
method) and asks with `holdsSchemaPermission(context, schema, name)`. Access
answers through its protected policy: the rule of the same name, else the
permission's own `allowWithoutRule` key, else a refusal. Core holds the
permission when one policy grants it and none refuses it, and Master always
holds it. Access never imports the declaring plugin.

Soft Delete's `readDeleted` is one; the example grants it to editors, beside
the rules of Soft Delete's commands:

<!-- region ../../examples/access/src/schema.ts#factory,members,comment -->

```ts
import { accessPlugin, allOf, anyOf, not } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ rest: true }),
	postgresPlugin(),
)

/** The people who use the newsroom; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing. Only trusted server code changes members. */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
}).with({ roles: { ensure: ['editor', 'admin', 'muted'] } })

export const Editor = StaffRole.role('editor')
export const Admin = StaffRole.role('admin')
export const Muted = StaffRole.role('muted')

/**
 * `softDelete: true` adds request commands (`softDeleteOne`, `restoreOne`…) and
 * the `readDeleted` permission. Each has its own Access key: `update` and
 * `delete` grant none of them.
 */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
		pinned: field.boolean({ default: false }),
	}),
	softDelete: true,
}).with({
	access: {
		read: true,
		// Authenticated members may comment unless they are muted.
		create: allOf(isAuthenticated, not(hasRole(Muted))),
		// Authors hide their own comments, except pinned ones.
		softDeleteOne: {
			where: ({ principal, where }) =>
				principal === undefined ? false : where.eq('author', principal.id),
			item: ({ originalItem }) => !originalItem.pinned,
		},
		restoreOne: anyOf(hasRole(Editor), hasRole(Admin)),
		// Editors also see hidden comments in ordinary reads.
		readDeleted: hasRole(Editor),
	},
})
```

<!-- endregion -->

## Plugin-owned schema mutations

The `access` rule gains one key for each plugin command the schema's statics
carry (`SchemaCommands`) whose authority is `request`. The key is the exact
application command name, and its callbacks receive the mutation's payload and
immutable logical identity. The mutation declaration and Runtime handler still
have one source owner. In the `Comment` above, `softDeleteOne` is authorized
as its own logical operation: its `where` filter keeps other authors' comments
out of reach and its `item` check keeps pinned ones.

A command's physical update or delete does
not invoke or inherit `access.update` or `access.delete`, and an update or
delete rule cannot grant it. `where` runs before target loading and returns
`true`, `false` or the target filter, and `item` observes the locked original
plus the owner-resolved candidate. Without a rule, its own `allowWithoutRule` key, then
`write`, then `all` decide. Ordinary
field output restrictions still shape the final selected result. Compatible
providers may add the same exact branch through `schemaAccess()`; those rules
run after the developer decision and can only narrow it.

Unknown, removed, and Master-only command keys fail TypeScript and
are rejected again against the final compiled application graph before setup
effects. Without `accessPlugin()`, none of these stages exist and a valid schema
mutation continues through Core normally.

## Official-compatible providers

A plugin that intentionally contributes official Access declarations uses the
public contribution helpers and declares a non-ordering peer. The provider may
appear before or after the engine in plugin configuration.

```ts unverified
import {
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { plugin } from '@ultimabase/core/plugin'

export const editorialPolicyPlugin = plugin({
	version: '1.0.0',
	core: '^0.0.0',
	id: 'community.editorial-policy',
	peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
	contributions: [
		provideAccessContributions('published-posts', () =>
			schemaAccess(Post, {
				read: ({ where }) => where.eq('published', true),
			}),
		),
	],
})
```

`globalAccess`, `schemaAccess`, and `fieldAccess` cover direct targets.
`fieldKindAccess` lets a provider protect every occurrence of a field kind it
owns; `defineFieldKindAccessTarget` creates the exact namespaced target. A
provider that owns a direct option can compile each occurrence through that
option's Runtime compiler, while structural selection remains available to
schema-declaration plugins. All Access helpers normalize declarations before
the official engine consumes them.
Every provider policy narrows the developer policy; no contribution can
override an earlier denial.
Compatible-provider policies share the engine's unconditional master bypass;
the contribution helpers expose no per-policy master mode.

Contributors do not inherit the Access engine's privileges. Inline Access callbacks execute as
application callbacks, while contributed rules execute under their exact
plugin and optional instance identity through Core's application-bound callback
executor. A rule that initiates a new Master elevation therefore needs its own
`authority:elevate` request. Already-master requests bypass the complete Access
policy before any callback executes.

Independent policy engines should not depend on this package. They can define
their own authoring vocabulary and contribute Core `protectedPolicy()` values
directly.

### Compatible-provider conformance

An official-compatible provider can test its declarations through package-root
exports by making itself the conformance subject, installing `accessPlugin()`
as support, and attaching a product-owned `persistence` check:

```ts unverified
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: editorialPolicyPlugin,
			supportPlugins: [
				accessPlugin({ allowWithoutRule: { all: true } }),
				databaseFixturePlugin(),
			],
			schemas: [Post],
		}),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.editorial-policy',
		version: '1.0.0',
	},
}).check('persistence', async ({ createUltimaBase }) => {
	const { ultimabase } = createUltimaBase()
	await ultimabase.start()
	await Post.findMany(undefined)
	// Assert the adapter-visible row filter and monotonic denial here.
})

await runPluginConformance(suite)
```

The suite helpers come from `@ultimabase/testing/plugins`; the Access engine and
provider helpers come from this package root. A provider can add focused item,
field, relation, transition, and master-bypass assertions without asking an
independent policy engine to adopt this vocabulary.

ACL follows that independent path: `@ultimabase/acl-permissions-plugin` depends
only on Core's generic protected-policy and adapter-constraint contracts. It
protects ACL-enabled schemas with no official Access engine installed and
composes monotonically when Access or another policy engine is present.

## Diagnostics

When Access denies a request, it logs one line naming the schema, the
operation, the step (`operation`, `row filter`, `item` or `field`) and the
rule, for example
`denied update on Post at the item step (Post.access.update.item)`. The line
is `info` outside production and `debug` in production (ADR-0313); clients
receive the same `PERMISSION_DENIED` as before, and `can()` answers are not
logged.

Provide `accessDiagnosticsObserverCapability` from a plugin with
`runtime:observe` to receive immutable callback completion events. Observer
failures are isolated and cannot change a policy outcome.
