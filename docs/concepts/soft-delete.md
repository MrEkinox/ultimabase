# Soft delete

`@ultimabase/soft-delete-plugin` is the official way to keep deleted records as
hidden rows without teaching Core or a transport what “soft delete” means. Each
schema opts in with the `softDelete` feature key of `define` (ADR-0339); the
plugin is written with `definePlugin` (ADR-0316).

```ts
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Application = UltimaBase.use(softDeletePlugin())

const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: true,
})

const ultimabase = new Application({ schemas: [Post] })
```

## Choosing a mode

| Declaration                       | Native delete                             | Added commands   |
| --------------------------------- | ----------------------------------------- | ---------------- |
| no `softDelete` key               | Physical delete                           | None             |
| `softDelete: true`                | Logical delete, physical tombstone update | The six commands |
| `softDelete: { mode: 'command' }` | Physical delete                           | The six commands |

The six commands are `softDeleteOne`, `softDeleteMany`, `restoreOne`,
`restoreMany`, `purgeOne` and `purgeMany`. The default mode is useful when
every existing delete entry point must become recoverable without changing its
public name: Access, Hooks, audit results and ordered `deleteMany` item
semantics still observe a native logical delete; only the protected persistence
plan changes. Command mode is useful when callers must choose between
recoverable and permanent deletion.

```ts
await Post.softDeleteOne({ id: postId })
await Post.softDeleteMany({ where: { title: { startsWith: 'Draft' } } })
```

The one-row request commands reach a transport only when the schema's rule
names them (ADR-0324, ADR-0325): `.with({ rest: { softDeleteOne: true } })` adds
`POST /api/classes/Post/{id}/soft-delete-one` (and `…/restore-one` for
`restoreOne`), `.with({ graphql: { softDeleteOne: true } })` adds the
`softDeleteOnePost` mutation. Transport exposure grants no authority.

## Visibility and lifecycle

Opted-in schemas receive the server-written `isDeleted` (required boolean,
default `false`) and `deletedAt` (optional date-time) fields. Mutation input
cannot set them. Core's generic protected constraint boundary adds
`isDeleted = false` to ordinary singular and collection reads, counts,
existence checks, relation and pointer traversal, eager materialization, and
mutation target lookup. Reads by a caller holding the `readDeleted` schema
permission skip it (Access grants it by rule, ADR-0317); Master holds it but
skips the filter only when its own `where` names `isDeleted`;
writes never skip it, and restore and purge see tombstones only.

The optional Access plugin rules each request command under its own name
(`access.softDeleteOne`, `access.restoreOne`, …); it does not reuse
`access.update` or `access.delete`. The optional Hooks plugin similarly accepts
`beforeOperation.softDeleteOne` and the other command branches. A physical
tombstone update never manufactures logical update Hooks; in the default mode
the original logical delete Hooks run once.

All effects execute inside the ordinary automatic mutation transaction. A
rejected Access decision or Hook leaves the row unchanged, and a many-row
command or an ordered native delete batch rolls back every earlier write when
one later row fails.

## Restore and purge

`restoreOne` and `restoreMany` clear the tombstone and `deletedAt` while
preserving identity, fields, pointers and relations; they are request commands
ruled by Access. `purgeOne` and `purgeMany` permanently delete existing
tombstones under normal database integrity rules and require an audited Master
context. All retain transactional Hooks and cancellation.

```ts
await Post.restoreOne({ id: postId })
await Post.purgeOne({ id: postId }, { useMasterKey: true })
```

Restoring a row whose unique value another row took meanwhile fails with a
`UNIQUE_VIOLATION` naming the command, the row and the field. Applications that
want deleted rows to release their unique values declare a partial unique index
`where: { isDeleted: false }` in the `indexes` of `define`.

## Deliberate limits

No actor or reason metadata, cascade policy, retention job or automatic purge.
Reading tombstones goes through the `readDeleted` schema permission
(ADR-0317): a caller who holds it sees them in ordinary reads; Master sees them
when its `where` names `isDeleted`.
Application code should not update the tombstone manually; use the commands so
protected constraints, authority, Hooks, and transactions remain intact.

See the runnable [`minimal`](../../examples/minimal/README.md) application for
direct, REST, networkless GraphQL, Yoga, Access, Hooks, and PostgreSQL examples.
