# @ultimabase/acl-permissions-plugin

Provides the immutable `ACL` class, the typed `acl()` schema extension, and the
optional `aclPlugin()` provider.

ACL grants object-level `read`, `update`, and `delete` rights to public,
authenticated, exact-principal, and role subjects. One ACL may contain multiple
principals and roles within its configured entry limits. The provider
contributes native Access filters, item checks, and field restrictions that
compile into database filtering rather than post-filtering in memory.

PostgreSQL stores the ACL as non-null indexed JSONB on the protected row through
the field's portable versioned codec. Object and ACL writes are therefore one
atomic row mutation with no generated ACL table. Logical role names resolve to
schema-qualified stable UUID references before persistence.

The immutable ACL value currently supports this API:

```ts
const value = new ACL()
	.grantPublic('read')
	.grantPrincipal(User.pointer(aliceId), 'read', 'update')
	.grantPrincipal(User.pointer(bobId), 'read')
	.grantRole(Editor, 'read', 'update')

const updated = value.revokePrincipal(User.pointer(aliceId), 'read')
updated.permissionsForRole(Editor)

const document = updated.toJSON()
const restored = ACL.fromJSON(JSON.parse(JSON.stringify(document)))
```

`ACLJSON` is a detached versioned format. Parsing rejects unknown keys,
versions, subjects, and permissions. Repeated rights and repeated entries are
combined by union, then serialized in canonical order.

`acl()` injects one reserved, required `acl: ACL` field without requiring a
manual field declaration. Create input keeps that field optional because
`aclPlugin()` supplies a static or asynchronous default after ordinary field
input resolution and before structural revalidation:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		visibility: field.string(),
	}),
	extensions: ({ bind }) => [
		bind(acl, {
			default: ({ data, principal }) => {
				const initial =
					data.visibility === 'public'
						? new ACL().grantPublic('read')
						: new ACL()

				return principal === undefined
					? initial
					: initial.grantPrincipal(principal, 'read', 'update')
			},
		}),
	],
})
```

Explicit ACL input is accepted only for trusted master execution and when the
schema declares `resolveInput`. Create-many evaluates the default independently
for every item inside the root transaction. Non-master requests can never read,
filter, order by, or replace the reserved ACL field, even when their ACL grants
ordinary object updates.

The shared callback receives `data` as the complete proposed developer-field
snapshot on both create and singular update. Update additionally exposes the
locked `currentData` and the normalized non-ACL `update` operations:

```ts
const deriveACL = (visibility: string | null) =>
	visibility === 'public' ? new ACL().grantPublic('read') : new ACL()

extensions: ({ bind }) => [
	bind(acl, {
		resolveInput: ({ currentAcl, data, inputAcl }) =>
			inputAcl ?? currentAcl ?? deriveACL(data.visibility),
	}),
],
```

The contextual declaration is opt-in. Static extensions may keep the shorter
`extensions: [acl()]` tuple; use `({ bind }) => [...]` when callbacks need exact
sibling-field autocomplete without a duplicated data interface.

The update candidate includes unchanged fields and applies `set` (including
`null` clears) and numeric operations before the callback. Framework-generated timestamps remain
visible in `update.operations` but are not mixed into schema-local `data`.
Throwing from the callback aborts the same automatic transaction.

`aclPlugin()` bounds persisted ACL size with safe application defaults. Limits
count canonical principal and role entries, so repeated grants for one subject
count once while public and authenticated rights count toward neither limit:

```ts
aclPlugin({
	limits: {
		maxPrincipals: 100,
		maxRoles: 50,
	},
})
```

The zero-option defaults are 100 principals and 50 roles. A schema may override
either value independently while inheriting the other:

```ts
acl({
	limits: { maxPrincipals: 25 },
	default: ({ principal }) =>
		principal === undefined
			? new ACL().grantPublic('read')
			: new ACL().grantPrincipal(principal, 'read', 'update'),
})
```

Static and asynchronous defaults, explicit master input, create-many items, and
singular updates are validated before persistence. Master bypasses ACL
authorization, never size validation or the singular replacement requirement.
Replacing an existing ACL therefore uses `Schema.updateOne()`; `updateMany()`,
`upsertOne()`, and `upsertMany()` reject ACL replacement even for trusted master
execution.

Authentication and roles are optional providers. ACL discovers them only
through neutral Core services and never imports a concrete auth or roles
plugin. Provider lookup happens after application setup, so top-level order and
nested plugin configuration do not change ACL behavior. A static default that
already contains role grants requires a compatible provider during setup;
dynamically produced role grants fail before persistence when the required
role capabilities are unavailable. Trusted master execution bypasses ACL
authorization but still runs validation, defaults, hooks, transactions,
constraints, and audit behavior.

Subject deletion remains owned by the authentication, role, or community
provider that owns that subject. `aclPlugin()` registers neutral principal and
role reference contributions that those providers may inspect for `fail`,
ignore for `preserve`, or invoke for `cascade`. Cascade removes only the exact
subject entry from every matching ACL-enabled row through ordinary singular
updates in the active deletion transaction. Unrelated grants survive, and a
failure in any schema rolls back both earlier cleanup and subject deletion.

Every semantic persisted ACL change also emits one typed event after the outer
transaction commits. Defaults, explicit master input, singular updates, bulk
creates, and cascade cleanup share the same event. Rollback discards queued
changes, and assigning an equivalent reconstructed ACL emits nothing.

```ts
import {
	aclChangedEvent,
	onACLChange,
} from '@ultimabase/acl-permissions-plugin'
import { definePlugin } from '@ultimabase/core'

const aclAuditPlugin = definePlugin({
	pluginId: 'app.acl-audit',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'runtime:observe',
			reason: 'Records committed ACL changes.',
		},
	],
	setup: ({ events }) => {
		events.register(
			'record-acl-change',
			onACLChange(({ event }) => {
				console.log(
					event.name === aclChangedEvent,
					event.payload.actor,
					event.payload.target,
					event.payload.diff,
				)
			}),
		)
	},
})
```

The payload groups added and removed `read`, `update`, and `delete` rights by
public, authenticated, exact-principal, or role subject. It is detached,
immutable, and contains no private ACL collection. Observation is optional:
`aclPlugin()` works without an audit consumer, and no realtime or transport
plugin publishes ACL changes by default.

`payload.operation` uses the item-oriented business name `create`, `update`,
or `upsert`. It deliberately does not expose Core's normalized operation AST or
its internal cardinality.

The extension also works on a developer-defined RoleSchema. Native RoleSchema
Access controls creation, while each persisted role ACL may narrow reads,
updates, member or nested-role mutations, and deletion. Only master execution
may inspect or replace the role row's ACL value.

With PostgreSQL, install the dedicated integration after both dependency
plugins. The ACL package itself stays adapter-neutral:

```ts
plugins: [
	aclPlugin(),
	postgresPlugin({ url: databaseUrl }),
	aclPostgresPlugin(),
]
```

`@ultimabase/acl-postgres-plugin` compiles the opaque ACL row constraint into
indexed JSONB containment predicates. Missing integration fails closed instead
of silently ignoring ACL enforcement.
