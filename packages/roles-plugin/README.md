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

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { RoleSchema, hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

const User = Schema.define({
	className: 'User',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
})

const AppRole = RoleSchema.define({
	className: 'Role',
	members: { schema: User },
	deletion: { references: 'fail' },
	fields: (field) => ({
		description: field.string(),
		priority: field.int({ default: 0 }),
	}),
	access: {
		read: true,
		create: false,
		update: false,
		delete: false,
	},
})

const EditorReference = AppRole.role('editor')

const Post = Schema.define({
	className: 'Post',
	access: {
		update: hasRole(EditorReference),
	},
	fields: (field) => ({
		title: field.string(),
	}),
})

const ultimabase = new UltimaBase({
	schemas: [User, AppRole, Post],
	plugins: [accessPlugin(), rolesPlugin()],
})

const Editor = await new AppRole({
	name: 'editor',
	description: 'Content editors',
}).create({}, { ultimabase, useMasterKey: true })
const Administrator = await new AppRole({ name: 'administrator' }).create(
	{},
	{ ultimabase, useMasterKey: true },
)
const EditorById = AppRole.role({ id: Editor.id })

await Editor.addMember(User.pointer(user.id), {
	ultimabase,
	useMasterKey: true,
})
await Administrator.addRole(Editor, { ultimabase, useMasterKey: true })
```

`RoleSchema.define()` injects `name`, `members`, and `roles`. Role names are
stored as their NFKC-normalized, trimmed, lower-case identity and are unique in
their schema. The framework-owned UUID remains stable when a role is renamed.
The generated `members` relation targets the exact declared member schema;
`roles` is a self relation used for nested membership.

`AppRole.role(name)` always means a normalized name. The object form
`AppRole.role({ id })` always means a UUID, so a string is never guessed to be
one or the other. Both return frozen Core-neutral role references without
performing I/O.

`resolveRoleReference()` performs a strict schema-qualified lookup when server
code needs the stored model. A UUID reference reads the exact object directly;
a name reference reads at most two matches and rejects absent or ambiguous
storage. Renaming a role never changes its UUID identity.

`rolesPlugin()` receives no configuration. `RoleSchema.define()` records exact
package-private class identity and inserts an opaque, package-created direct
option that requires the plugin during static compilation. Copying the option
as a plain object or reproducing the generated fields cannot create role
behavior. The compiler-only option declares `typegen: false`, so its internal
name and nominal value type never appear in generated authoring options or
autocomplete. Applications without a role schema do not need the plugin.

Role schemas carry no generic transport metadata. Trusted server code can use
schema-root reads such as `AppRole.findMany()`; future generated transport
exposure must use an explicit contract owned by the relevant transport plugin.

Persisted role results expose `addMember()` and `removeMember()`. Both accept a
Pointer or persisted result of the exact member schema, delegate to the normal
relation lifecycle, inherit ambient execution or ordinary operation options,
and emit `ultimabase.roles.membership.changed` only after commit. Draft roles,
raw identifiers, and unrelated schema values are rejected.

Role membership, hierarchy, and deletion events are optional committed
notifications. Without an observer, role writes queue no post-commit delivery;
registered `onRoleEvent()` consumers provided through
`provideRoleEventObserver()` still receive each event once in deterministic
plugin order. Observer plugins declare `ultimabase.roles` as a non-ordering
peer and request `runtime:observe`; Roles itself has no Hooks dependency.

Each role schema owns its external-reference deletion policy. `fail` is the
safe default and rejects roles that still own members, child roles, parent-role
edges, or references reported by another plugin. `preserve` deletes the role
and leaves external references inert. `cascade` requires master authority,
clears role-owned edges, and invokes only explicit provider-neutral cleanup
contributions inside the same transaction. Successful deletion emits
`ultimabase.roles.deleted` after commit. Both `role.delete({}, options)` and
`AppRole.deleteOne({ where: { id: { eq: id } } })` execute the complete policy.
`AppRole.deleteMany({ where: [...] })` executes the same policy for each unique
target, in input order, inside one transaction. A failure rolls back the whole
collection, including its cleanup and post-commit notifications.

`hasRole(reference)` is an ordinary official Access decision. Using it requires
`accessPlugin()` in the application. It resolves the application-local
`requestRoleResolverCapability` at execution time, so the declaration captures
no application or request. A missing provider raises
Core's typed `PLUGIN_CAPABILITY_MISSING` error before business hooks or database
execution; an installed provider with no current member or no membership
returns `false`.

The official provider calls the RoleSchema's optional `resolveCurrent` once per
RequestEngine and domain, validates that it returned a Pointer from the exact
member schema, then loads direct roles and all parent roles through ordinary
Query. One immutable membership snapshot and each reference resolution are
memoized for that engine, so repeated schema, field, or future ACL checks do not
traverse the graph again. Master authority does not imply membership.

Persisted policy providers may also request a canonical role reference. The
neutral resolver converts a name selector to the RoleSchema's stable UUID
without loading current membership, allowing ACL storage to remain independent
from this package and from mutable role names.

Persisted roles also expose distinct `addRole()` and `removeRole()` commands.
`Administrator.addRole(Editor)` makes Editor a child role, so its direct and
inherited members belong to Administrator. The plugin checks the complete
post-update graph inside the active transaction, rejects self or indirect
cycles before commit, handles diamond paths once, and fails explicitly beyond
64 levels or 10,000 visited roles. Direct membership and membership inherited
from parent roles remain separate in the internal immutable resolution snapshot
used by Access.
