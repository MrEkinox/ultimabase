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

Nested-role resolution, deletion policies, and native `hasRole()` decisions
are implemented by the following issues in this milestone.
