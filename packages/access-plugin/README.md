# `@ultimabase/access-plugin`

The optional official Access engine for UltimaBase. The package owns schema and
field `access` declarations, deterministic policy compilation, diagnostics, and
protected Runtime enforcement. Importing it has no effect; an application must
configure `accessPlugin()` explicitly.

The direct field `access` option is available on stored fields, embedded object
properties, and the enclosing virtual field. It never appears on properties
inside an output descriptor: Access protects the virtual field as one logical
selectable result.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(accessPlugin())
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
	access: {
		read: ({ where }) => where.eq('published', true),
	},
})

const ultimabase = new Application({
	schemas: [Post],
})
```

## Rules in `.with` (ADR-0297)

With the generation-free declaration form of
[ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md), schema rules
move to the final `.with` call, typed by `AccessRules` and contributed through
`AccessSchemaRules`. Filters may cross thunk targets in both directions without
Typegen. The `access` option of `define` above keeps working during the
migration.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'

const App = UltimaBase.use(accessPlugin())
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		author: field.pointer({ target: () => Author }),
	}),
}).with({
	access: { read: ({ where }) => where.eq('published', true) },
})
```

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
`accessPlugin()` is installed. Schema `access` callbacks use the retained
Typegen descriptor because their items, row filters, relationships, and plugin
mutation keys depend on the complete application graph. A factory without the
plugin exposes neither contract, and Runtime compilation still rejects untyped
JavaScript declarations that try to use them.

JavaScript uses the same compiled graph without generated declarations. This
application intentionally has no Access engine, so direct CRUD has no official
Access policy stage:

```js
import { UltimaBase } from '@ultimabase/core'

const Post = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({ schemas: [Post] })
await ultimabase.start()
await Post.findMany(undefined)
```

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

```ts
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'

const App = UltimaBase.use(accessPlugin())
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({ author: field.string(), body: field.string() }),
}).with({
	access: {
		create: isAuthenticated,
		update: ({ principal, where }) => where.eq('author', principal?.id ?? ''),
	},
})
```

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
them or a row filter. A function that may return nothing is a type error.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

const App = UltimaBase.use(accessPlugin(), rolesPlugin())
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.string(),
		published: field.boolean(),
	}),
}).with({
	access: {
		read: ({ where }) => where.eq('published', true),
		create: isAuthenticated,
		update: {
			where: ({ principal }) => principal !== undefined,
			item: ({ originalItem, item, principal }) =>
				originalItem.author === principal?.id &&
				item.author === originalItem.author,
		},
		delete: hasRole(Admin),
	},
})
```

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

```ts
accessPlugin({ allowWithoutRule: { all: true, write: false } })
accessPlugin({
	allowWithoutRule: { read: true, count: false, write: isAuthenticated },
})
accessPlugin({ allowWithoutRule: { all: 'development' } })
```

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

```ts
const App = UltimaBase.use(accessPlugin(), softDeletePlugin())
App.Schema.define({ className: 'Post', fields })
	.softDelete()
	.with({ access: { read: true, readDeleted: hasRole(Admin) } })
```

## Plugin-owned schema mutations

Typegen adds one Access key for each schema mutation in the compiled graph whose
authority is `request`. The key is the exact application command name, and its
callbacks receive the mutation's payload and immutable logical identity. The
mutation declaration and Runtime handler still have one source owner; Typegen
projects only their inert application-local type:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(accessPlugin())
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({
		published: field.boolean(),
		title: field.string(),
	}),
	access: {
		archive: {
			where: ({ input, mutation, where }) =>
				input.reason.length > 0 &&
				mutation.name === 'community.workflow.archive' &&
				where.eq('published', true),
			item: ({ item, originalItem }) =>
				item.published === false && originalItem.published === true,
		},
		update: false,
		delete: false,
	},
})

const ultimabase = new Application({
	schemas: [Post],
})
```

`archive` is authorized as its own logical operation. Its physical update does
not invoke or inherit `access.update`, and an update or delete rule cannot grant
it. `where` runs before target loading and returns `true`, `false` or the
target filter, and `item` observes the locked original plus the
owner-resolved candidate. Without a rule, its own `allowWithoutRule` key, then
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

```ts
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

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'

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

The suite helpers come from `@ultimabase/testing`; the Access engine and
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
