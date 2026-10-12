# @ultimabase/acl-permissions-plugin

Stores per-row rights: the immutable `ACL` value, the `.acl()` shape method,
the `acl` rule of `.with(...)`, and the `aclPlugin()` provider (ADR-0321).

ACL grants object-level `read`, `update`, and `delete` rights to public,
authenticated, exact-principal, and role subjects. The provider contributes
generic Core protected policies and adapter constraints that compile into
database filtering rather than post-filtering in memory. It has no dependency
or peer relationship with `@ultimabase/access-plugin`.

**Access or ACL?** Access computes one rule for all rows of a schema; ACL
stores the rights of each row with the row, so rows are shared one by one.
Both compose when installed; neither widens the other.

The official provider declares `authority:elevate` only for its persisted ACL
reference-maintenance queries. Ordinary policy evaluation does not elevate,
and neither a subject resolver nor another policy plugin inherits this
privilege through ACL. `aclPlugin()` returns no application setup value.

## Declaring ACL

`.acl()` adds one reserved, required, indexed `acl` field through Core's
fields slot; `.with({ acl })` configures it, and its `default` is required
once `.acl()` is called, because an empty ACL hides a row from everyone but
Master:

```ts
const Application = UltimaBase.use(aclPlugin())

export const Note = Application.Schema.define({
	className: 'Note',
	fields: (field) => ({
		title: field.string({ required: true }),
		visibility: field.string(),
	}),
})
	.acl()
	.with({
		acl: {
			// The creator may read and write; anonymous creators get an empty ACL.
			default: ({ principal }) => new ACL(principal),
		},
	})
```

The rule (`ACLRule`) accepts:

- `default` (required): one ACL, or a function of the created values (`data`,
  typed from the schema's fields) and the request
  `principal` (ADR-0304). It runs independently for each created item.
- `resolveInput`: recomputes the ACL from the row's data on each create and
  each singular update that carries no explicit ACL. On update it receives
  the locked `currentAcl`, `currentData`, the proposed `data` and the
  normalized non-ACL `update` operations; `undefined` keeps the default or the
  current ACL. A schema with `resolveInput` refuses set-based `updateMany`,
  which cannot recompute each row.
- `clientSharing`: lets clients share rows (below).
- `existingRows`: the ACL rows already in a table receive when `.acl()` is
  added and `default` is a function (below).
- `limits`: overrides the plugin limits for this schema.

Master may write a complete ACL in create and update data; it is written as
is, without `resolveInput`. Clients can never read, filter, order by, or
replace it. Replacing an ACL through `upsertOne()`, `upsertMany()`, or a
set-based update stays refused, even for Master.

## The ACL value

```ts
const value = new ACL()
	.grantPublic('read')
	.grantPrincipal(User.pointer(aliceId), 'read', 'write')
	.grantRole(Editor, 'read', 'update')

const updated = value.revokePrincipal(User.pointer(aliceId), 'write')
updated.permissionsForRole(Editor)

const document = updated.toJSON()
const restored = ACL.fromJSON(JSON.parse(JSON.stringify(document)))
```

`new ACL(owner)` grants `read` and `write` to `owner`, like
`new Parse.ACL(user)`; `new ACL(undefined)` is empty. The group `'write'`
means `update` and `delete`, as in Access. `acl.entries()` lists who holds
which rights: `public` and `authenticated` when they hold any, users as
Pointers, and roles as references whose name Roles' `resolveRoleReference()`
reads; `grantPrincipal`/`grantRole` accept them back.

`ACLJSON` is a detached versioned format. Parsing rejects unknown keys,
versions, subjects, and permissions. Repeated rights and repeated entries are
combined by union, then serialized in canonical order.

## Sharing

`grant` and `revoke` change one principal's rights without reading the ACL
first. They apply to the locked row inside the update's transaction, so
concurrent shares never overwrite each other:

```ts
await Note.updateOne({
	where: { id },
	data: {
		acl: { grant: { principal: User.pointer(bobId), permissions: ['read'] } },
	},
})
await Note.updateOne({
	where: { id },
	data: { acl: { revoke: { principal: User.pointer(bobId) } } },
})
```

`revoke` removes every right of the principal, or only the listed
`permissions`. Master may share any row. A client may share a row it can read
only when `clientSharing` allows it, instead of the `update` right, and never
grants a right it does not hold itself on that row:

```ts
acl: {
	default: ({ principal }) => new ACL(principal),
	clientSharing: ({ principal, currentAcl }) =>
		principal !== undefined &&
		currentAcl.hasPrincipalPermission(principal, 'update'),
},
```

`select: { acl: true }` is accepted for Master and, with `clientSharing`, on
the rows it allows; any other row fails the read with `PERMISSION_DENIED`.

## Enabling and disabling ACL on existing tables

The `acl` field tells storage, through Core's neutral plugin field metadata
(`existingRows`, `storageDefault`), what existing rows receive and which
default the column keeps. With PostgreSQL synchronization:

- an empty table gets the column directly;
- a table with rows gives them a fixed value (`ADD COLUMN … NOT NULL DEFAULT
…`, no rewrite): the `default` when it is one ACL, else `existingRows`;
- a function `default` without `existingRows` stops `start()` with the steps
  to follow;
- under `schemaPolicy: 'fail'`, nothing changes and the message names the value.

The column is `NOT NULL` and keeps an empty-ACL default. Removing `.acl()`
later keeps the column and its data; rows written afterward get an empty ACL,
and the index is dropped.

## Limits

`aclPlugin()` bounds persisted ACL size. Limits count canonical principal and
role entries, so repeated grants for one subject count once while public and
authenticated rights count toward neither limit:

```ts
aclPlugin({ limits: { maxPrincipals: 100, maxRoles: 50 } })
```

The zero-option defaults are 100 principals and 50 roles; `acl.limits`
overrides either value for one schema. Master bypasses ACL authorization,
never size validation or the singular replacement requirement.

## Subjects, references and events

Authentication and roles are optional providers. ACL discovers them only
through neutral capabilities (Core's principal resolver and the role protocol
of `@ultimabase/plugin-kit`, ADR-0329) and never imports a concrete auth or
roles plugin. A static default that contains role grants requires a compatible
provider during setup; dynamically produced role grants fail before
persistence when the required role capabilities are unavailable. Logical role
names resolve to schema-qualified stable UUID references before persistence.

Subject deletion remains owned by the authentication, role, or community
provider that owns that subject. `aclPlugin()` registers neutral principal and
role reference contributions that those providers may inspect for `fail`,
ignore for `preserve`, or invoke for `cascade`. Cascade removes only the exact
subject entry from every matching ACL-enabled row through ordinary singular
updates in the active deletion transaction.

Every semantic persisted ACL change also emits one typed event after the outer
transaction commits (best effort). Defaults, explicit Master input, shares,
singular updates, bulk creates, and cascade cleanup share the same event.
Rollback discards queued changes, and assigning an equivalent ACL emits
nothing.

```ts
import {
	aclChangedEvent,
	onACLChange,
	provideACLChangeObserver,
} from '@ultimabase/acl-permissions-plugin'
import { plugin } from '@ultimabase/core/plugin'

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
public, authenticated, exact-principal, or role subject. `payload.operation`
is `create`, `update`, or `upsert`.

## Storage and transports

PostgreSQL stores the ACL as non-null indexed JSONB on the protected row
through the field's portable versioned codec, so object and ACL writes are one
atomic row mutation. Filters use the field's `contains` operator:
`where: { acl: { contains: { public: ['read'] } } }`. Adapters that do not
advertise structural containment fail before database execution instead of
silently ignoring ACL enforcement. With PostgreSQL, install only the ACL and
database plugins:

```ts
const Application = UltimaBase.use(aclPlugin(), postgresPlugin())
```

The strictly validated ACL JSON is attached to the canonical
`ultimabase.rest@1.0.0` and `ultimabase.graphql.field@1.0.0` field-wire
protocols, without making ACL depend on either transport package.

A role schema declared with `App.RoleSchema.define(...)` may call `.acl()`
too; only Master may inspect or replace the role row's ACL.
