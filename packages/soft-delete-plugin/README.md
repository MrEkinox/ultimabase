# @ultimabase/soft-delete-plugin

Official soft-delete support for UltimaBase application schemas.

The package establishes the immutable configuration and direct schema-option
contract. Enabled application schemas receive the protected tombstone,
ordinary operations see only active rows, and `replace-delete` schemas persist
native deletes as tombstone updates. An `explicit` schema keeps native hard
delete and gains a distinct `softDelete` command.

```ts
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Application = UltimaBase.use(
	softDeletePlugin({ defaultMode: 'disabled' }),
)
const Post = Application.Schema.define({
	className: 'Post',
	softDelete: 'explicit',
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new Application({
	schemas: [Post],
})
```

Importing the package has no effect. `softDeletePlugin()` must be present in the
application plugin graph before Core recognizes the direct `softDelete` option.
The configured factory projects the option, tombstone field, and applicable
commands directly from the plugin declaration. Typegen remains responsible for
the application-wide named schema graph; the compiled application remains
Runtime truth.

The runnable [`examples/minimal`](../../examples/minimal/README.md) application
proves both modes, authenticated REST and GraphQL execution, direct generated
handles, transactional Hook evidence, and private Master administration against
PostgreSQL.

## Mode inheritance

`defaultMode` accepts `disabled`, `replace-delete`, or `explicit` and defaults to
`disabled`. A schema may declare `softDelete: false | 'replace-delete' |
'explicit'`. Omission inherits the plugin default; `false` always disables the
feature for that schema. There is no plugin-level schema list or selector
callback, and plugin-owned schemas are never enabled implicitly.

| Effective mode   | Native delete | Additional public mutation |
| ---------------- | ------------- | -------------------------- |
| `disabled`       | hard delete   | none                       |
| `replace-delete` | tombstone     | none                       |
| `explicit`       | hard delete   | `softDelete`               |

Replace mode keeps the logical delete operation—including its Access, Hooks,
audit, result, and transaction semantics—while only the physical persistence
plan writes the tombstone. Explicit mode retains hard delete and adds a distinct
logical `softDelete` mutation with its own Access and Hooks identity.

## Replace-delete execution

For an effective `replace-delete` schema, `deleteOne` and every item in the
ordered `deleteMany` schema command remain native logical deletes. REST and
GraphQL therefore retain their existing delete names, inputs, results, Access,
Hooks, observers, cancellation, and error behavior. Only the protected physical
plan becomes one atomic update that sets the plugin-owned `isDeleted` field.
Native update policy, Hooks, validators, defaults, and generators are not run.

The update receives the same Core-owned target restrictions as the logical
delete and returns its pre-delete record. A second delete cannot distinguish the
now-hidden row from an absent row. Itemized batches remain one transaction, so
one rejected item rolls back every earlier tombstone written by that batch.
Schemas in `explicit` or `disabled` mode do not enter the rewriter target plan
and retain physical hard-delete persistence.

## Explicit execution

For an effective `explicit` schema, the class, application schema handle, and
every bound persisted model expose the same singular command after startup:

```ts
const deleted = await Post.softDelete(
	{ id: postId, select: { id: true, isDeleted: true, title: true } },
	{ ultimabase },
)

const deletedFromHandle = await ultimabase.schema(Post).softDelete({
	id: postId,
	select: { id: true, isDeleted: true, title: true },
})

await ultimabase.schema(Post).for(post).softDelete()
```

The command has the stable logical identity
`ultimabase.soft-delete.soft-delete`, loads one currently visible target, sets
only `isDeleted: true`, and returns the postimage. It does not replay native
update or delete policy and Hooks. A repeated call receives the ordinary
non-disclosing missing-target error because the tombstone is already hidden.

When the optional official integrations are installed, they discover this
generic mutation descriptor. Access accepts an independent `access.softDelete`
rule, Hooks accepts `beforeOperation.softDelete` and
`afterOperation.softDelete`, REST publishes
`POST /api/v1/classes/{Schema}/{id}/soft-delete`, and GraphQL publishes
`softDelete{Schema}(input: { id: ID! })`. Replace and disabled schemas never
gain those additional transport endpoints.

## Private administration

Every effective `explicit` or `replace-delete` schema exposes two commands on
its class and application schema handle, but never on a persisted model:

```ts
const restored = await Post.restore(
	{ id: postId, select: { id: true, isDeleted: true, title: true } },
	{ ultimabase, useMasterKey: true },
)

const purged = await Post.purge(
	{ id: postId, select: { id: true, title: true } },
	{ ultimabase, useMasterKey: true },
)
```

`restore` atomically clears `isDeleted` on an existing tombstone and returns
the restored postimage. Stored fields, pointers, and relation memberships are
preserved. `purge` accepts only an existing tombstone, physically deletes it
under the database's ordinary integrity rules, and returns its preimage. A
missing, active, or already purged target produces the same non-disclosing
missing-object result.

Both commands require an application-provenanced Core Master context before
target lookup. `useMasterKey: true` goes through the mandatory Master audit; an
already elevated request context can be inherited without a second elevation.
The optional Hooks plugin exposes `beforeOperation.restore`,
`afterOperation.restore`, `beforeOperation.purge`, and `afterOperation.purge`
for transactional business audit and rejection. Master does not bypass those
Hooks.

The commands deliberately have no model method, Access branch, REST route, or
GraphQL field. Server code must select the owning application explicitly or
through an active trusted request; no transport input can manufacture Master
authority. The application schema handle remains available for both commands.

## Optional integrations and protected storage

The package depends only on Core and Plugin Kit. It does not install or require
the official Access, Hooks, REST, GraphQL, Yoga, PostgreSQL, or audit plugins.
When installed, those products discover the generic compiled mutation surface
instead of receiving a soft-delete-specific integration. Explicit soft delete
keeps structural validation, protected targeting, transactionality, and
persistence when Access and Hooks are absent.

Enabled schemas own the fixed stored boolean `isDeleted`, defaulting to
`false`. Caller-controlled create, update, nested-write, REST, and GraphQL input
cannot write it. A protected monotonic constraint hides tombstoned items from
ordinary reads and mutation targets even without Access or Hooks. Restore and
purge remain audited Master-only schema commands and never become REST or
GraphQL endpoints.

The same private `isDeleted = false` predicate applies to singular and
collection reads, counts, existence checks, pointer and relation traversal,
eager targets, and ordinary update/delete target lookup. It is kept outside the
developer query AST, composed with PostgreSQL through the generic row-filter
contract, and remains enforced for Master requests. Selecting `isDeleted` is
allowed so mutation results can later expose the resulting state; setting it in
caller input is not.

## V1 exclusions

V1 deliberately has no configurable tombstone field, deletion timestamp,
deleter identity, reason, include-deleted query, cascade policy, uniqueness
reuse, retention job, automatic purge, bulk soft delete, nested soft delete, or
public restore and purge endpoint.
