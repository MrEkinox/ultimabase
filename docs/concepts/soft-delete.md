# Soft delete

`@ultimabase/soft-delete-plugin` is the official way to keep deleted records as
hidden PostgreSQL rows without teaching Core or a transport what “soft delete”
means. The source schema selects behavior; Typegen only describes the resulting
application handles.

```ts
import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const Application = UltimaBase.use(
	softDeletePlugin({ defaultMode: 'disabled' }),
)
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: 'explicit',
})

const ultimabase = new Application({
	schemas: [Post],
})
```

## Choosing a mode

The application default is `disabled`, `replace-delete`, or `explicit`. An
omitted schema option inherits it; `softDelete: false` always disables the
plugin for that schema.

| Mode             | Native delete                             | Added command |
| ---------------- | ----------------------------------------- | ------------- |
| `disabled`       | Physical delete                           | None          |
| `replace-delete` | Logical delete, physical tombstone update | None          |
| `explicit`       | Physical delete                           | `softDelete`  |

Replace mode is useful when every existing delete entry point must become
recoverable without changing its public name. Access, Hooks, audit results, and
ordered `deleteMany` item semantics still observe a native logical delete; only
the protected persistence plan changes.

Explicit mode is useful when callers must choose between recoverable and
permanent deletion. It adds a separately authorized command to the application
schema handle and its persisted models:

```ts
await ultimabase.schema(Post).softDelete({ id: postId })

const post = await ultimabase.schema(Post).findOne({
	where: { id: { eq: postId } },
})
await post?.softDelete()
```

When REST or GraphQL already exposes the schema mutation, the optional
transport plugin derives `POST /api/v1/classes/Post/{id}/soft-delete` or
`softDeletePost(input: { id: ID! })`. Transport exposure grants no authority.

## Visibility and lifecycle

Enabled schemas receive a protected required boolean `isDeleted` field whose
default is `false`. Mutation input cannot set it. Core's generic protected
constraint boundary adds `isDeleted = false` to ordinary singular and
collection reads, counts, existence checks, relation and pointer traversal,
eager materialization, and mutation target lookup. Master does not bypass this
integrity rule.

The optional Access plugin accepts an independent `access.softDelete` policy.
It does not reuse `access.update` or `access.delete`. The optional Hooks plugin
similarly accepts `beforeOperation.softDelete` and
`afterOperation.softDelete`. A physical tombstone update never manufactures
logical update Hooks. In replace mode, the original logical delete Hooks run
once.

All effects execute inside the ordinary automatic mutation transaction. A
rejected Access decision or Hook leaves the row unchanged, and an ordered
native delete batch rolls back every earlier tombstone when one later item
fails.

## Restore and purge

Enabled schemas also receive private `restore` and `purge` methods on their
application schema handle. They require an application-provenanced, audited
Master context before target lookup:

```ts
await ultimabase.schema(Post).restore({ id: postId }, { useMasterKey: true })

await ultimabase.schema(Post).purge({ id: postId }, { useMasterKey: true })
```

`restore` clears the tombstone while preserving identity, fields, pointers, and
relations. `purge` permanently deletes only an existing tombstone under normal
database integrity rules. Both retain transactional Hooks and cancellation.
Neither command has a model method, Access branch, REST route, or GraphQL field.

## Deliberate V1 limits

V1 has one fixed tombstone field and no include-deleted query, deletion time,
actor or reason metadata, cascade policy, partial unique-index strategy,
uniqueness reuse, retention job, automatic purge, public restore or purge,
bulk soft delete, or nested soft delete. Application code should not update the
tombstone manually; use the generated commands so protected constraints,
authority, Hooks, and transactions remain intact.

See the runnable [`minimal`](../../examples/minimal/README.md) application for
direct, REST, networkless GraphQL, Yoga, Access, Hooks, and PostgreSQL examples.
