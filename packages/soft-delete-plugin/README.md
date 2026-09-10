# @ultimabase/soft-delete-plugin

Official soft-delete support for UltimaBase application schemas.

The package establishes the immutable configuration and direct schema-option
contract. Enabled application schemas receive the protected tombstone,
ordinary operations see only active rows, and `replace-delete` schemas persist
native deletes as tombstone updates. The explicit mutation and Master
administration are delivered by the following milestone issues.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Post = Schema.define({
	className: 'Post',
	softDelete: 'explicit',
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({
	plugins: [softDeletePlugin({ defaultMode: 'disabled' })],
	schemas: [Post],
})
```

Importing the package has no effect. `softDeletePlugin()` must be present in the
application plugin graph before Core recognizes the direct `softDelete` option.
Typegen adds that option to authoring declarations, but the source declaration
and compiled application graph remain Runtime truth.

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

## Optional integrations and protected storage

The package depends only on Core and Plugin Kit. It does not install or require
the official Access, Hooks, REST, GraphQL, Yoga, PostgreSQL, or audit plugins.
When installed, those products discover the generic compiled mutation surface
instead of receiving a soft-delete-specific integration.

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
