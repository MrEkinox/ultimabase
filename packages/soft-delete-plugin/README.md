# @ultimabase/soft-delete-plugin

Official soft-delete support for UltimaBase application schemas.

A schema opts in with the `.softDelete()` shape method. It gains the
server-written `isDeleted` and `deletedAt` fields, ordinary operations see
only active rows, and six commands: `softDeleteOne`, `softDeleteMany`,
`restoreOne`, `restoreMany`, `purgeOne` and `purgeMany`. Without options,
native `deleteOne` and `deleteMany` write tombstones; with
`{ mode: 'command' }` they stay physical deletes.

```ts
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Application = UltimaBase.use(softDeletePlugin())

const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete()
	.with({})

const ultimabase = new Application({ schemas: [Post] })
```

Importing the package has no effect, and the factory takes no options: each
schema decides in its own declaration (ADR-0316, review decisions 1 and 2).
The configured factory types the method, the fields and the commands from the
plugin declaration; no generated declarations are needed. The plugin is written
with `definePlugin` from `@ultimabase/plugin-kit` and is the proving plugin of
ADR-0316.

The runnable [`examples/minimal`](../../examples/minimal/README.md) application
proves both modes, authenticated REST and GraphQL execution, transactional Hook
evidence, and private Master purge against PostgreSQL.

## Modes

| Declaration                        | `deleteOne` / `deleteMany` | Commands                             |
| ---------------------------------- | -------------------------- | ------------------------------------ |
| `.softDelete()`                    | tombstone                  | the six commands                     |
| `.softDelete({ mode: 'command' })` | hard delete                | the six commands                     |
| no `.softDelete()`                 | hard delete                | none, and no `isDeleted`/`deletedAt` |

In the default mode the logical delete keeps its Access, Hooks, audit, result
and transaction semantics; only the physical persistence plan becomes one
atomic update that sets `isDeleted: true` and `deletedAt` to the current time.
Native update policy, Hooks, validators, defaults and generators are not run.
Core checks the pre-delete record against the read rules, then the delete
returns the record as written (ADR-0306); `deleteMany` writes one tombstone per
target in one transaction, and one rejected item rolls back the batch.

## Commands

```ts
const deleted = await Post.softDeleteOne({
	id: postId,
	select: { isDeleted: true, deletedAt: true },
})
const restored = await Post.restoreOne({ id: postId })
const removed = await Post.purgeMany(
	{ where: { title: { startsWith: 'Draft' } } },
	{ useMasterKey: true },
)
```

| Command                            | Authority | Rows seen  | Writes                                |
| ---------------------------------- | --------- | ---------- | ------------------------------------- |
| `softDeleteOne` / `softDeleteMany` | request   | visible    | `isDeleted: true`, `deletedAt: now`   |
| `restoreOne` / `restoreMany`       | request   | tombstones | `isDeleted: false`, `deletedAt: null` |
| `purgeOne` / `purgeMany`           | Master    | tombstones | physical delete, returns the preimage |

`…One` commands take `{ id }`, `…Many` commands take `{ where }` and resolve to
one result per written row, in identifier order; both accept `select` and
`include`. A many-row command runs the one-row Access rule, Hooks and
readable-result check for each matching row inside one transaction, and one
refused row rolls the whole command back. `softDeleteOne` checks the read rules
on the row before it hides it (`checkReadable: 'before'`).

Request commands are ruled by the optional Access plugin under their own name
(`access.softDeleteOne`, `access.restoreOne`, …): restoration is closed when
the rule is absent and no `allowWithoutRule` key opens it (ADR-0317). Purge requires an audited
Master context; Master never bypasses Hooks. The Hooks plugin exposes
`beforeOperation` and `afterOperation` branches for every command.

The one-row request commands are published by the installed transports:
`POST /api/v1/classes/{Schema}/{id}/soft-delete-one` and `…/restore-one` in
REST, `softDeleteOne{Schema}` and `restoreOne{Schema}` in GraphQL. Many-row
commands and purge have no route.

## Unique values

A tombstone keeps its data and its unique values, unless the application
declares a partial unique index in the final `.with` (ADR-0303); the plugin
never adds one:

```ts
App.Schema.define({
	className: 'Article',
	fields: (field) => ({ slug: field.string({ required: true }) }),
})
	.softDelete()
	.with({
		indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
	})
```

Restoring a tombstone whose slug another row took meanwhile fails with
`UNIQUE_VIOLATION` and the message
`Cannot run restoreOne on Article <id>: slug is now used by another row.`; the
conflicting value stays in the error's internal details, since field read
rules may hide it from the caller.

## Visibility and protected storage

The package depends only on Core and Plugin Kit. Access, Hooks, REST, GraphQL
and PostgreSQL discover the generic compiled commands; none receives a
soft-delete-specific integration.

`isDeleted` (stored boolean, default `false`) and `deletedAt` (optional
date-time) are written by the server only: create, update, nested-write, REST
and GraphQL input cannot write them. A protected monotonic constraint keeps
`isDeleted = false` on every singular and collection read, count, existence
check, pointer and relation traversal, eager target and ordinary update or
delete target; restore and purge see tombstones only. The predicate stays
outside the developer query AST, so `where: { isDeleted: { eq: true } }`
returns nothing to a caller without `readDeleted`.

## Reading deleted rows: `readDeleted`

`.softDelete()` declares the schema permission `readDeleted` through Core
(ADR-0317). Reads by a caller who holds it skip the protected filter: they see
tombstones and can filter and sort them (`where: { isDeleted: { eq: true } }`,
`orderBy: { deletedAt: 'desc' }`), REST and GraphQL included. Updates, deletes
and commands never reach tombstones through it. With Access, grant it by a rule
of the same name or by its own `allowWithoutRule` key (`all`, `read` and
`write` never include it); a caller without it never sees tombstones, whatever
its `where`:

```ts
const App = UltimaBase.use(softDeletePlugin(), accessPlugin())
App.Schema.define({ className: 'Post', fields })
	.softDelete()
	.with({ access: { read: true, readDeleted: hasRole(Auditor) } })
```

Master holds every permission, but its reads keep the trash filter by default
(ADR-0317, 6.1 amendment): a server job using `useMasterKey` never includes
tombstones silently, and no longer needs `where: { isDeleted: false }`. A
Master read returns tombstones only when its own `where` constrains
`isDeleted`: any condition on this schema's `isDeleted`, at any depth of `AND`,
`OR` and `NOT` (a condition inside a relation predicate does not count):

```ts
await Post.findMany(undefined, { useMasterKey: true }) // live rows only
await Post.findMany({ where: { isDeleted: true } }, { useMasterKey: true }) // the trash
await Post.count(
	{ where: { isDeleted: { in: [true, false] } } },
	{ useMasterKey: true },
) // every row
```

This holds for `findMany`, `findOne`, `findOneOrThrow`, `count`, `exists`,
inclusions (with the inclusion's own `where`), REST and GraphQL. Restore and
purge keep reaching tombstones for Master and for allowed callers.

The package still imports neither Access nor any other policy plugin. A soft deletion triggers no referential action
(ADR-0299): a pointer to a tombstone keeps its value and its inclusion returns
`null` until a purge.

## Not yet

No deleter identity, reason, cascade policy, retention job, automatic purge or
nested soft delete.
