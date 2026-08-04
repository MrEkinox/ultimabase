# @ultimabase/roles

Developer-defined, schema-backed roles for UltimaBase.

The package specializes the ordinary Core schema model instead of owning a
parallel role repository. Applications keep control of custom fields, indexes,
Access, hooks, adapter extensions, and trusted server queries.

```ts
import { Schema, intField, stringField } from '@ultimabase/core'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles'

const User = Schema.define({
	className: 'User',
	fields: {
		email: stringField({ validation: { required: true } }),
	},
})

const AppRole = RoleSchema.define({
	className: 'Role',
	members: { schema: User },
	deletion: { references: 'fail' },
	fields: {
		description: stringField(),
		priority: intField({ default: 0 }),
	},
	access: {
		operation: {
			read: true,
			create: ({ context }) => context.access.mode === 'master',
			update: ({ context }) => context.access.mode === 'master',
			delete: ({ context }) => context.access.mode === 'master',
		},
	},
})

const Editor = await new AppRole({
	name: 'editor',
	description: 'Content editors',
}).create({ useMasterKey: true })

const EditorByName = AppRole.role('editor')
const EditorById = AppRole.role({ id: Editor.id })

await Editor.addMember(User.pointer(user.id), { useMasterKey: true })
await Editor.removeMember(User.pointer(user.id), { useMasterKey: true })

await Administrator.addRole(Editor, { useMasterKey: true })
await Administrator.removeRole(Editor, { useMasterKey: true })

const ultimabase = new UltimaBase({
	schemas: [User, AppRole],
	plugins: [rolesPlugin()],
})
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

`rolesPlugin()` receives no schema options. It discovers registered role
schemas and claims their private extension. Registering a role schema without
the plugin fails during application setup. Applications without a role schema
do not need the plugin.

Role schemas carry hidden-by-default transport metadata. Transport packages
must require an explicit opt-in before generating administrative role APIs;
trusted server code can always use `new Query(AppRole)` or `AppRole.query()`.

Persisted role results expose `addMember()` and `removeMember()`. Both accept a
Pointer or persisted result of the exact member schema, delegate to the normal
relation lifecycle, inherit ambient execution or ordinary terminal options,
and emit `ultimabase.roles.membership.changed` only after commit. Draft roles,
raw identifiers, and unrelated schema values are rejected.

Each role schema owns its external-reference deletion policy. `fail` is the
safe default and rejects roles that still own members, child roles, parent-role
edges, or references reported by another plugin. `preserve` deletes the role
and leaves external references inert. `cascade` requires master authority,
clears role-owned edges, and invokes only explicit provider-neutral cleanup
contributions inside the same transaction. Successful deletion emits
`ultimabase.roles.deleted` after commit. Set-based `deleteMany()` is rejected;
ordinary `role.delete()` and `AppRole.query().byId(id).delete()` both execute
the complete policy.

Native `hasRole()` decisions are implemented by the following issue in this
milestone.

Persisted roles also expose distinct `addRole()` and `removeRole()` commands.
`Administrator.addRole(Editor)` makes Editor a child role, so its direct and
inherited members belong to Administrator. The plugin checks the complete
post-update graph inside the active transaction, rejects self or indirect
cycles before commit, handles diamond paths once, and fails explicitly beyond
64 levels or 10,000 visited roles. Direct and inherited child roles remain
separate in the internal immutable resolution snapshot used by Access.
