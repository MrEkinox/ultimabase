# @ultimabase/acl-permissions-plugin

Provides the immutable `ACL` class, the direct typed `acl` schema option, and
the optional `aclPlugin()` provider.

ACL grants object-level `read`, `update`, and `delete` rights to public,
authenticated, exact-principal, and role subjects. One ACL may contain multiple
principals and roles within its configured entry limits. The provider
contributes generic Core protected policies and adapter constraints that
compile into database filtering rather than post-filtering in memory. It has no
dependency or peer relationship with `@ultimabase/access-plugin`.

ACL contributes the schema-scoped `acl` option rather than a direct field
option, so field declaration contexts do not broaden or restrict its contract.
Its reserved stored field continues to be added through the owner-attributed
schema patch.

The official provider declares `authority:elevate` only for its persisted ACL
reference-maintenance queries. Ordinary policy evaluation does not elevate,
and neither a subject resolver nor another policy plugin inherits this
privilege through ACL.

`aclPlugin()` returns no application setup value. Inspect the configured schemas
through `application.schemas` when needed.

PostgreSQL stores the ACL as non-null indexed JSONB on the protected row through
the field's portable versioned codec. Object and ACL writes are therefore one
atomic row mutation with no generated ACL table. Logical role names resolve to
schema-qualified stable UUID references before persistence.

The same strictly validated public ACL JSON is explicitly attached to the
canonical `ultimabase.rest@1.0.0` and
`ultimabase.graphql.field@1.0.0` field-wire protocols. This lets REST and
GraphQL expose an ACL-enabled application schema without making ACL depend on
either transport package or silently reusing its storage declaration as a wire
contract. Runtime ACL field policy still rejects anonymous selection of the
reserved field.

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

When `aclPlugin()` is installed, the direct `acl` option adds one reserved,
required `acl: ACL` field without a manual field declaration. Without the
plugin, the option is unknown and static compilation fails. Create input keeps
the field optional because the plugin supplies a static or asynchronous default
after ordinary field input resolution and before structural revalidation:

```ts
const ACLApplication = UltimaBase.use(aclPlugin())
const Post = ACLApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		visibility: field.string(),
	}),
	acl: {
		default: ({ data, principal }) => {
			const initial =
				data.visibility === 'public' ? new ACL().grantPublic('read') : new ACL()

			return principal === undefined
				? initial
				: initial.grantPrincipal(principal, 'read', 'update')
		},
	},
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

acl: {
	resolveInput: ({ currentAcl, data, inputAcl }) =>
		inputAcl ?? currentAcl ?? deriveACL(data.visibility),
},
```

The configured factory exposes the ACL option and its local shape immediately.
Exact sibling-field autocomplete inside `acl.default` and `acl.resolveInput`
comes from the completed application Typegen graph; regenerate it after schema
changes. Typegen references the public `ACLSchemaOption` type without copying
callbacks or producing a Runtime client. JavaScript needs no generation.

With the generation-free declaration form of
[ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md), the `.acl()`
shape method adds the field (`ACLShapeSource`) and the final `.with` carries the
`acl` rule (`ACLRules`, contributed through `ACLSchemaRules`), with sibling
fields typed without Typegen. Filters use the plugin's typed `contains`
operator: `where: { acl: { contains: { public: ['read'] } } }`. The direct
`acl` option keeps working during the migration.

```ts
export const Post = ACLApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({ visibility: field.string() }),
})
	.acl()
	.with({
		acl: {
			default: ({ data }) =>
				data.visibility === 'public'
					? new ACL().grantPublic('read')
					: new ACL(),
		},
	})
```

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
const Post = ACLApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	acl: {
		limits: { maxPrincipals: 25 },
		default: ({ principal }) =>
			principal === undefined
				? new ACL().grantPublic('read')
				: new ACL().grantPrincipal(principal, 'read', 'update'),
	},
})
```

Static and asynchronous defaults, explicit master input, create-many items, and
singular updates are validated before persistence. Master bypasses ACL
authorization, never size validation or the singular replacement requirement.
Replacing an existing ACL uses `Schema.updateOne()` or an itemized
`Schema.updateMany()` entry with one exact target per item. Set-based updates,
`upsertOne()`, and `upsertMany()` reject ACL replacement even for trusted master
execution.

Authentication and roles are optional providers. ACL discovers them only
through neutral Core capabilities and never imports a concrete auth or roles
plugin. Provider lookup happens after application setup, so root configuration
order does not change ACL behavior. A static default that
already contains role grants requires a compatible provider during setup;
dynamically produced role grants fail before persistence when the required
role capabilities are unavailable. Trusted master execution bypasses ACL
authorization but still runs validation, defaults, installed Runtime behavior,
transactions, constraints, and audit behavior.

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
	provideACLChangeObserver,
} from '@ultimabase/acl-permissions-plugin'
import { plugin } from '@ultimabase/core'

const aclAuditPlugin = plugin({
	id: 'app.acl-audit',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [
		{ pluginId: '@ultimabase/acl-permissions-plugin', version: '^0.0.0' },
	],
	permissions: {
		'runtime:observe': 'Records committed ACL changes.',
	},
	contributions: [
		provideACLChangeObserver(
			'record-acl-change',
			onACLChange(({ event }) => {
				console.log(
					event.name === aclChangedEvent,
					event.payload.actor,
					event.payload.target,
					event.payload.diff,
				)
			}),
		),
	],
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

The direct option also works on a developer-defined RoleSchema. Official RoleSchema
Access controls creation when `accessPlugin()` is installed, while each
persisted role ACL may narrow reads,
updates, member or nested-role mutations, and deletion. Only master execution
may inspect or replace the role row's ACL value.

With PostgreSQL, install only the ACL and database plugins. The ACL package
stays adapter-neutral:

```ts
const Application = UltimaBase.use(aclPlugin()).use(
	postgresPlugin({ url: databaseUrl }),
)
```

The ACL field validates its narrow portable containment fragments and the
generic PostgreSQL plugin-field compiler lowers them to indexed JSONB
predicates. Adapters that do not advertise structural containment fail before
database execution instead of silently ignoring ACL enforcement.
