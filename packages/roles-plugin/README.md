# @ultimabase/roles-plugin

Developer-defined, schema-backed roles for UltimaBase.

The package specializes the ordinary Core schema model instead of owning a
parallel role repository. Applications keep control of custom fields, indexes,
optional official Access and Hooks, adapter options, and trusted server
queries.

The official plugin declares `authority:elevate` because persisted membership,
hierarchy, and deletion maintenance initiate audited internal Master queries.
Caller-selected Master execution is merely inherited; no dependency, peer, or
policy consumer receives this privilege from Roles.

Installing `rolesPlugin()` adds `App.RoleSchema` to the configured factory
(ADR-0322). Declare each role schema with the schema of its members, then end
with `.with({ ... })` like any schema; an application may declare several role
schemas.

```ts
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

const App = UltimaBase.use(accessPlugin(), rolesPlugin())

export const TodoUser = App.Schema.define({
	className: 'TodoUser',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with({ access: { read: true } })

export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	deletion: 'fail',
	// Created at start() when missing; existing roles are left unchanged.
	ensure: ['editor', 'administrator'],
	fields: (field) => ({ description: field.string() }),
}).with({
	access: { read: true, create: false, update: false, delete: false },
})

export const Editor = TodoRole.role('editor')

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { read: true, update: hasRole(Editor) } })

export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Post] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
```

`members` is a function so the role and member schemas may reference each
other. Rules, indexes and plugin options go in `.with(...)`; shape methods
such as `.acl()` may be chained before it. `deletion` is `'fail'` (default),
`'preserve'` or `'cascade'`. `resolveCurrent` replaces the current member for
special cases. Applications with role schemas register `typeof ultimabase`
like any other (the ADR-0297 step 4 workaround is gone).

```ts
const master = { useMasterKey: true } as const
const editor = await TodoRole.findOneOrThrow(
	{ where: { name: 'editor' } },
	master,
)
await TodoRole.updateOne(
	{
		where: { id: editor.id },
		data: { members: { connect: [TodoUser.pointer(userId)] } },
	},
	master,
)
await TodoRole.updateOne(
	{
		where: { name: 'administrator' },
		data: { includedRoles: { connect: [editor.id] } },
	},
	master,
)
const EditorById = TodoRole.role({ id: editor.id })
```

Members and included roles link through the same relation commands as any
schema (ADR-0308): `members` and `includedRoles` take `connect`, `disconnect`
and `set` in `createOne` and `updateOne` data. Every target must be visible to
the caller, the plugin rejects hierarchy cycles and depth beyond its limits,
and membership and hierarchy events are emitted for these links. Role results
are plain data without commands (ADR-0310).

`ultimabase.plugin(rolesPlugin)` exposes role queries outside rules, with the
same computation and cache as the rules:

```ts
const roles = ultimabase.plugin(rolesPlugin)
await roles.has(Editor) // the current request's member, inside a request
await roles.has(Editor, { principal: TodoUser.pointer(userId) })
await roles.current(TodoRole) // names, inheritance included
```

`ensure` creates its roles at `start()` through the application's
`masterAuthority`, idempotently: a role another instance created concurrently
counts as present.

The factory injects `name`, `members`, and `includedRoles`. Role names are
stored as their NFKC-normalized, trimmed, lower-case identity and are unique
in their schema. The framework-owned UUID remains stable when a role is
renamed. The `members` relation targets the declared member schema;
`includedRoles` is a self relation: the members of an included role are
members of the role that includes it.

`TodoRole.role(name)` always means a normalized name. The object form
`TodoRole.role({ id })` always means a UUID, so a string is never guessed to be
one or the other. Both return frozen Core-neutral role references without
performing I/O.

`resolveRoleReference()` performs a strict schema-qualified lookup when server
code needs the stored row. A UUID reference reads the exact object directly;
a name reference reads at most two matches and rejects absent or ambiguous
storage. Renaming a role never changes its UUID identity.

`rolesPlugin()` receives no configuration. `App.RoleSchema.define()` records
exact package-private class identity and inserts an opaque, package-created
direct option that requires the plugin during static compilation. Copying the option
as a plain object or reproducing the generated fields cannot create role
behavior. The compiler-only option declares `typegen: false`, so its internal
name and nominal value type never appear in generated authoring options or
autocomplete. Applications without a role schema do not need the plugin.

Role schemas carry no generic transport metadata. Trusted server code can use
schema-root reads such as `TodoRole.findMany()`; future generated transport
exposure must use an explicit contract owned by the relevant transport plugin.

A `members` link change delegates to the normal relation lifecycle, inherits
ambient execution or ordinary operation options, and emits
`ultimabase.roles.membership.changed` only after commit.

Role membership, hierarchy, and deletion events are optional committed
notifications. Without an observer, role writes queue no post-commit delivery;
registered `onRoleEvent()` consumers provided through
`provideRoleEventObserver()` still receive each event once in deterministic
plugin order. Observer plugins declare `@ultimabase/roles-plugin` as a non-ordering
peer and request `runtime:observe`; Roles itself has no Hooks dependency.

Each role schema owns its external-reference deletion policy. `fail` is the
safe default and rejects roles that still own members, child roles, parent-role
edges, or references reported by another plugin. `preserve` deletes the role
and leaves external references inert. `cascade` requires master authority,
clears role-owned edges, and invokes only explicit provider-neutral cleanup
contributions inside the same transaction. Successful deletion emits
`ultimabase.roles.deleted` after commit.
`TodoRole.deleteOne({ where: { id: { eq: id } } })` executes the complete policy.
`TodoRole.deleteMany({ where: [...] })` executes the same policy for each unique
target, in input order, inside one transaction. A failure rolls back the whole
collection, including its cleanup and post-commit notifications.

`hasRole(reference)` returns a named Core `PolicyPredicate` (ADR-0304), which
Access, ACL and other policy plugins accept wherever a rule returns a
decision; Roles has no dependency on the Access package. It resolves the
application-local `requestRoleResolverCapability` at execution time, so the
declaration captures no application or request. A missing provider raises
Core's typed `PLUGIN_CAPABILITY_MISSING` error before business hooks or database
execution; an installed provider with no current member or no membership
returns `false`.

The current member is the request principal resolved by Core when it belongs
to the RoleSchema's member schema; the optional `resolveCurrent` replaces it
for special cases. The official provider resolves the member once per
RequestEngine and domain, validates that `resolveCurrent` returned a Pointer
from the exact member schema, then loads direct roles and all parent roles
through ordinary Query. One immutable membership snapshot and each reference resolution are
memoized for that engine, so repeated schema, field, or future ACL checks do not
traverse the graph again. Master authority does not imply membership.

Persisted policy providers may also request a canonical role reference. The
neutral resolver converts a name selector to the RoleSchema's stable UUID
without loading current membership, allowing ACL storage to remain independent
from this package and from mutable role names.

Connecting Editor to Administrator's `includedRoles` makes Editor an included
role, so its direct and inherited members belong to Administrator. The plugin checks the complete
post-update graph inside the active transaction, rejects self or indirect
cycles before commit, handles diamond paths once, and fails explicitly beyond
64 levels or 10,000 visited roles. Direct membership and membership inherited
from parent roles remain separate in the internal immutable resolution snapshot
used by Access.
