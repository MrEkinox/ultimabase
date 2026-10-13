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

Every code block in this README is copied from the tested
[`examples/roles`](../../examples/roles/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
schema file installs the plugin, declares a role schema with seed roles, and
uses those roles in Access rules:

<!-- region ../../examples/roles/src/schema.ts#factory,staff-role,post -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

import { roleAuditPlugin } from './role-audit.ts'

/**
 * Roles adds `App.RoleSchema` and resolves memberships; Access turns a
 * membership into a decision through `hasRole()`. The audit plugin observes
 * committed role changes. `postgresPlugin()` reads `DATABASE_URL` when the
 * application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	roleAuditPlugin,
	...apiServer({ http: { appId: 'newsroom' }, rest: true }),
	postgresPlugin(),
)

/** The people of the newsroom; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true } })

/**
 * Staff roles, created at start when missing. Everyone may read them; no
 * write rule exists, so only trusted server code (Master) changes them.
 */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
	// The default: refuse to delete a role that still has members or links.
	deletion: 'fail',
	ensure: ['editor', 'administrator'],
	fields: (field) => ({ description: field.string() }),
}).with({ access: { read: true } })

export const Editor = StaffRole.role('editor')
export const Administrator = StaffRole.role('administrator')

/** Editors write posts; administrators, who are editors too, delete them. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	access: {
		read: true,
		create: hasRole(Editor),
		update: hasRole(Editor),
		delete: hasRole(Administrator),
	},
})
```

<!-- endregion -->

`members` is a function so the role and member schemas may reference each
other. Rules, indexes and plugin options go in `.with(...)`; shape methods
such as `.acl()` may be chained before it. `deletion` is `'fail'` (default),
`'preserve'` or `'cascade'`. `resolveCurrent` replaces the current member for
special cases. Applications with role schemas register `typeof ultimabase`
like any other (the ADR-0297 step 4 workaround is gone).

`StaffRole` has no write rule, so trusted server code manages its membership
and hierarchy with audited Master authority:

<!-- region ../../examples/roles/src/staff.ts#staff-admin -->

```ts
const master = { useMasterKey: true } as const

/** Adds a member to a staff role, named by its stored lower-case name. */
export const addStaffMember = (
	role: 'administrator' | 'editor',
	memberId: string,
) =>
	StaffRole.updateOne(
		{
			where: { name: role },
			data: { members: { connect: [Member.pointer(memberId)] } },
			select: { id: true },
		},
		master,
	)

/** Removes a member from a staff role. */
export const removeStaffMember = (
	role: 'administrator' | 'editor',
	memberId: string,
) =>
	StaffRole.updateOne(
		{
			where: { name: role },
			data: { members: { disconnect: [Member.pointer(memberId)] } },
			select: { id: true },
		},
		master,
	)

/**
 * Makes administrators editors too: Editor includes the Administrator role,
 * so Administrator's members are members of Editor. Connecting it again
 * changes nothing.
 */
export const includeAdministratorsInEditors = async () => {
	const administrator = await StaffRole.findOneOrThrow(
		{ where: { name: 'administrator' }, select: { id: true } },
		master,
	)
	return StaffRole.updateOne(
		{
			where: { name: 'editor' },
			data: { includedRoles: { connect: [administrator.id] } },
			select: { id: true },
		},
		master,
	)
}
```

<!-- endregion -->

Members and included roles link through the same relation commands as any
schema (ADR-0308): `members` and `includedRoles` take `connect`, `disconnect`
and `set` in `createOne` and `updateOne` data. Every target must be visible to
the caller, the plugin rejects hierarchy cycles and depth beyond its limits,
and membership and hierarchy events are emitted for these links. Role results
are plain data without commands (ADR-0310).

`ultimabase.plugin(rolesPlugin)` exposes role queries outside rules, with the
same computation and cache as the rules:

<!-- region ../../examples/roles/tests/queries.test.ts#queries -->

```ts
const roles = ultimabase.plugin(rolesPlugin)
// Inside a request: the roles of its principal.
const graceIsEditor = await t.as(Member.pointer(grace.id), () =>
	roles.has(Editor),
)
const graceRoles = await t.as(Member.pointer(grace.id), () =>
	roles.current(StaffRole),
)
// Anywhere on the server: the roles of a given member.
const adaIsAdministrator = await roles.has(Administrator, {
	principal: Member.pointer(ada.id),
})
```

<!-- endregion -->

`ensure` creates its roles at `start()` with Roles' own `authority:elevate`
privilege (audited by the application's `masterAuthority` when one is
configured, else by its logger), idempotently: a role another instance created
concurrently counts as present.

The factory injects `name`, `members`, and `includedRoles`. Role names are
stored as their NFKC-normalized, trimmed, lower-case identity and are unique
in their schema. The framework-owned UUID remains stable when a role is
renamed. The `members` relation targets the declared member schema;
`includedRoles` is a self relation: the members of an included role are
members of the role that includes it.

`StaffRole.role(name)` always means a normalized name. The object form
`StaffRole.role({ id })` always means a UUID, so a string is never guessed to be
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
behavior. No rules slot types the compiler-only option, so its internal name
and nominal value type never appear in authoring options or autocomplete. Applications without a role schema do not need the plugin.

Role schemas are application schemas. Trusted server code can use schema-root
reads such as `StaffRole.findMany()`, and the REST and GraphQL transports
expose them like any other application schema, under their Access rules;
`rest: false` in `.with({ ... })` keeps one off REST.

A `members` link change delegates to the normal relation lifecycle, inherits
ambient execution or ordinary operation options, and emits
`ultimabase.roles.membership.changed` only after commit.

Role membership, hierarchy, and deletion events are optional committed
notifications. Without an observer, role writes queue no post-commit delivery;
registered `onRoleEvent()` consumers provided through
`provideRoleEventObserver()` still receive each event once in deterministic
plugin order. Observer plugins declare `@ultimabase/roles-plugin` as a non-ordering
peer and request `runtime:observe`; Roles itself has no Hooks dependency:

<!-- region ../../examples/roles/src/role-audit.ts#role-audit -->

```ts
import { plugin } from '@ultimabase/core/plugin'
import {
	onRoleEvent,
	provideRoleEventObserver,
	roleDeletedEvent,
	roleHierarchyChangedEvent,
	roleMembershipChangedEvent,
} from '@ultimabase/roles-plugin'

/** Committed role changes, in order. Replace it with a durable audit sink. */
export const roleAuditLog: string[] = []

/**
 * Observes the Roles events: each one arrives once, after its transaction
 * commits, and never for a change that rolled back.
 */
export const roleAuditPlugin = plugin({
	id: 'example.role-audit',
	version: '1.0.0',
	core: '^0.0.0',
	// A peer, not a dependency: Roles delivers to the observers it finds.
	peers: [{ pluginId: '@ultimabase/roles-plugin', version: '^0.0.0' }],
	permissions: { 'runtime:observe': 'Records committed role changes.' },
	contributions: [
		provideRoleEventObserver(
			'role-audit-membership',
			onRoleEvent(roleMembershipChangedEvent, ({ event }) => {
				const { action, memberIds, roleId } = event.payload
				roleAuditLog.push(`${roleId}: ${action} members ${memberIds.join()}`)
			}),
		),
		provideRoleEventObserver(
			'role-audit-hierarchy',
			onRoleEvent(roleHierarchyChangedEvent, ({ event }) => {
				const { action, childRoleIds, roleId } = event.payload
				roleAuditLog.push(
					`${roleId}: ${action} included roles ${childRoleIds.join()}`,
				)
			}),
		),
		provideRoleEventObserver(
			'role-audit-deleted',
			onRoleEvent(roleDeletedEvent, ({ event }) => {
				const { policy, roleId } = event.payload
				roleAuditLog.push(`${roleId}: deleted (${policy})`)
			}),
		),
	],
})
```

<!-- endregion -->

Each role schema owns its external-reference deletion policy. `fail` is the
safe default and rejects roles that still own members, child roles, parent-role
edges, or references reported by another plugin. `preserve` deletes the role
and leaves external references inert. `cascade` requires master authority,
clears role-owned edges, and invokes only explicit provider-neutral cleanup
contributions inside the same transaction. Successful deletion emits
`ultimabase.roles.deleted` after commit.
`StaffRole.deleteOne({ where: { id: { eq: id } } })` executes the complete policy.
`StaffRole.deleteMany({ where: [...] })` executes the same policy for each unique
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

Connecting Administrator to Editor's `includedRoles`, as the example does,
makes Administrator an included role, so its direct and inherited members
belong to Editor. The plugin checks the complete
post-update graph inside the active transaction, rejects self or indirect
cycles before commit, handles diamond paths once, and fails explicitly beyond
64 levels or 10,000 visited roles. Direct membership and membership inherited
from parent roles remain separate in the internal immutable resolution snapshot
used by Access.
