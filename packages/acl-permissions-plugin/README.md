# @ultimabase/acl-permissions-plugin

Stores per-row rights: the immutable `ACL` value, the `acl` feature key of
`define`, the `plugins.acl(...)` rule of `.with`, and the `aclPlugin()`
provider (ADR-0321, ADR-0339).

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

Every TypeScript block below is copied from the
[ACL example](../../examples/acl/README.md), a small application whose tests
prove each behavior described here (ADR-0330).

`acl: true` in `define` adds one reserved, required, indexed `acl` field
through Core's fields slot; `plugins.acl({ … })` in `.with` configures it, and
its `default` is required once `acl: true` is set, because an empty ACL hides
a row from everyone but Master. The feature declares the rule as required:
a declaration without it is a TypeScript error, and fails when `.with` runs or
the application compiles. The example also installs Access, which decides who may create, and
Roles, which supplies role membership:

<!-- region ../../examples/acl/src/schema.ts#factory,note -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

/**
 * ACL stores the rights of each row with the row. Access decides which
 * operations run at all, creation included; Roles tells ACL the caller's
 * roles. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	aclPlugin(),
	accessPlugin(),
	rolesPlugin(),
	postgresPlugin(),
)

/**
 * Private notes. Access lets members create them and lets every operation
 * run; each note's ACL then decides who may read, update or delete it.
 */
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({ title: field.string({ required: true }) }),
	acl: true,
}).with({
	access: { read: true, create: isAuthenticated, update: true, delete: true },
	acl: {
		// The creator may read, update and delete; nobody else sees the note.
		default: ({ principal }) => new ACL(principal),
		// Whoever may update a note may share it.
		clientSharing: ({ principal, currentAcl }) =>
			principal !== undefined &&
			currentAcl.hasPrincipalPermission(principal, 'update'),
		// The owner and two other members at most.
		limits: { maxPrincipals: 3 },
	},
})
```

<!-- endregion -->

The rule (`ACLRule`) accepts:

- `default` (required): one ACL, or a function of the created values (`data`,
  typed from the schema's fields) and the request
  `principal` (ADR-0304). It runs independently for each created item.
- `resolveInput`: recomputes the ACL from the row's data on each create and
  each singular update that carries no explicit ACL. On update it receives
  the locked `currentAcl`, `currentData`, the proposed `data` and the
  normalized non-ACL `update` operations; `undefined` keeps the default or the
  current ACL. Each `updateMany` item is recomputed like an `updateOne`.
- `clientSharing`: lets clients share rows (below).
- `existingRows`: the ACL rows already in a table receive when `acl: true` is
  added and `default` is a function (below).
- `limits`: overrides the plugin limits for this schema.

Master may write a complete ACL in create, update and `updateMany` item data;
it is written as is, without `resolveInput`. Clients never filter, order by,
or replace it, and read it only where `clientSharing` allows: a client `where`
naming `acl`, also inside `AND`, `OR`, `NOT` or a relation filter, fails with
`PERMISSION_DENIED`, and an `include` filtered on it reads as absent. Replacing
an ACL through `upsertOne()` or `upsertMany()` stays refused, even for Master:

<!-- region ../../examples/acl/src/admin.ts#master-acl -->

```ts
/** Imports a note with a complete ACL: Master writes it as is. */
export const importNote = (title: string, ownerId: string) =>
	Note.createOne(
		{
			data: {
				title,
				acl: new ACL(Member.pointer(ownerId)).grantPublic('read'),
			},
		},
		{ useMasterKey: true },
	)

/** Hides a note from everyone but Master, whoever it was shared with. */
export const hideNote = (noteId: string) =>
	Note.updateOne(
		{ where: { id: noteId }, data: { acl: new ACL() } },
		{ useMasterKey: true },
	)

/** Master may filter on the ACL itself; clients never can. */
export const listPublicNotes = () =>
	Note.findMany(
		{
			where: { acl: { contains: { public: ['read'] } } },
			select: { title: true },
		},
		{ useMasterKey: true },
	)
```

<!-- endregion -->

## The ACL value

<!-- region ../../examples/acl/tests/values.test.ts#acl-value -->

```ts
const value = new ACL()
	.grantPublic('read')
	.grantPrincipal(ada, 'read', 'write')
	.grantRole(Editors, 'read', 'update')

const updated = value.revokePrincipal(ada, 'write')

const document = updated.toJSON()
const restored = ACL.fromJSON(JSON.parse(JSON.stringify(document)))
```

<!-- endregion -->

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

<!-- region ../../examples/acl/src/sharing.ts#share -->

```ts
/** Lets one member read the note, without reading its ACL first. */
export const shareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: {
			acl: {
				grant: { principal: Member.pointer(memberId), permissions: ['read'] },
			},
		},
	})

/** Removes every right the member holds on the note. */
export const unshareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: { acl: { revoke: { principal: Member.pointer(memberId) } } },
	})
```

<!-- endregion -->

`revoke` removes every right of the principal, or only the listed
`permissions`. Master may share any row. A client may share a row it can read
only when `clientSharing` allows it, instead of the `update` right, and never
grants a right it does not hold itself on that row:

<!-- region ../../examples/acl/src/schema.ts#client-sharing -->

```ts
// Whoever may update a note may share it.
clientSharing: ({ principal, currentAcl }) =>
	principal !== undefined &&
	currentAcl.hasPrincipalPermission(principal, 'update'),
```

<!-- endregion -->

`select: { acl: true }` is accepted for Master and, with `clientSharing`, on
the rows it allows; any other row fails the read with `PERMISSION_DENIED`.
`acl.entries()` lists the subjects; Roles' `resolveRoleReference()` reads a
role entry's row, untyped because a stored reference does not name its role
schema:

<!-- region ../../examples/acl/src/admin.ts#entries -->

```ts
/** Lists who holds which rights on an announcement, roles by name. */
export const describeAnnouncementACL = async (announcementId: string) => {
	const { acl } = await Announcement.findOneOrThrow(
		{ where: { id: announcementId }, select: { acl: true } },
		{ useMasterKey: true },
	)
	return Promise.all(
		acl.entries().map(async (entry) => {
			const rights = entry.permissions.join(', ')
			switch (entry.kind) {
				case 'principal':
					return `member ${entry.principal.id}: ${rights}`
				case 'role': {
					// A stored reference does not name its role schema, so the
					// resolved row is untyped: check the name before using it.
					const { name } = await resolveRoleReference(entry.role, {
						useMasterKey: true,
					})
					return `role ${typeof name === 'string' ? name : entry.role.value}: ${rights}`
				}
				default:
					return `${entry.kind}: ${rights}`
			}
		}),
	)
}
```

<!-- endregion -->

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

The column is `NOT NULL` and keeps an empty-ACL default. Removing `acl: true`
later keeps the column and its data; rows written afterward get an empty ACL,
and the index is dropped.

## Limits

`aclPlugin()` bounds persisted ACL size. Limits count canonical principal and
role entries, so repeated grants for one subject count once while public and
authenticated rights count toward neither limit. Set them for the application
with `aclPlugin({ limits: { maxPrincipals: 100, maxRoles: 50 } })`.

The zero-option defaults are 100 principals and 50 roles; `acl.limits`
overrides either value for one schema, as `maxPrincipals: 3` does on the
example's notes. Master bypasses ACL authorization,
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

<!-- region ../../examples/acl/src/acl-audit-plugin.ts#acl-audit-plugin -->

```ts
import {
	onACLChange,
	provideACLChangeObserver,
	type ACLChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import { plugin } from '@ultimabase/core/plugin'

/** Every committed ACL change, in order: a stand-in for a durable audit log. */
export const aclAuditLog: ACLChangedEvent[] = []

/** Records who changed which rights on which row, after each commit. */
export const aclAuditPlugin = plugin({
	id: 'example.acl-audit',
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
				aclAuditLog.push(event.payload)
			}),
		),
	],
})
```

<!-- endregion -->

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
database plugins: `UltimaBase.use(aclPlugin(), postgresPlugin())`.

The strictly validated ACL JSON is attached to the canonical
`ultimabase.rest@1.0.0` and `ultimabase.graphql.field@1.0.0` field-wire
protocols, without making ACL depend on either transport package.

A role schema declared with `App.RoleSchema.define(...)` may set `acl: true`
too; only Master may inspect or replace the role row's ACL.
