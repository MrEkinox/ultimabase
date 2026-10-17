# @ultimabase/soft-delete-plugin

Official soft-delete support for UltimaBase application schemas.

A schema opts in with the `softDelete` feature key of `define` (ADR-0339). It
gains the server-written `isDeleted` and `deletedAt` fields, ordinary
operations see only active rows, and six commands: `softDeleteOne`,
`softDeleteMany`, `restoreOne`, `restoreMany`, `purgeOne` and `purgeMany`.
With `softDelete: true`, native `deleteOne` and `deleteMany` write tombstones;
with `softDelete: { mode: 'command' }` they stay physical deletes. The plugin
has no `.with` rule of its own: the schema's Access, REST and GraphQL rules
name its commands.

Every code block in this README is copied from the tested
[`examples/soft-delete`](../../examples/soft-delete/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
schema file installs the plugin and opts a `Post` in:

<!-- region ../../examples/soft-delete/src/app.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * The configured factory types the `softDelete` key, its commands and fields.
 * Access and Roles only decide who may read the trash; Soft Delete needs
 * neither. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin(),
	rolesPlugin(),
	apiServer({ rest: true, graphql: true }),
	postgresPlugin(),
)
```

<!-- endregion -->

<!-- region ../../examples/soft-delete/src/schema.ts#imports,moderators,post -->

```ts
import { hasRole } from '@ultimabase/roles-plugin'

import { App } from './app.ts'

/** The people who use the blog; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing, so the `moderator` role always exists. */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
}).with({ roles: { ensure: ['moderator'] } })

export const Moderator = StaffRole.role('moderator')

/** Default mode: `deleteOne` and `deleteMany` write tombstones. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: true,
}).with({
	access: {
		// Every caller may write, delete and restore posts in this example.
		read: true,
		create: true,
		delete: true,
		softDeleteOne: true,
		softDeleteMany: true,
		restoreOne: true,
		restoreMany: true,
		// Only moderators see tombstones in ordinary reads.
		readDeleted: hasRole(Moderator),
	},
	// A command reaches REST or GraphQL only when the rule names it.
	rest: { softDeleteOne: true, restoreOne: true },
	graphql: { softDeleteOne: true, restoreOne: true },
})
```

<!-- endregion -->

Importing the package has no effect, and the factory takes no options: each
schema decides in its own declaration (ADR-0316, review decisions 1 and 2).
The configured factory types the method, the fields and the commands from the
plugin declaration; no generated declarations are needed. The plugin is written
with `definePlugin` from `@ultimabase/plugin-kit` and is the proving plugin of
ADR-0316.

The [`examples/full-stack`](../../examples/full-stack/README.md) application also
proves both modes with authenticated REST and GraphQL execution and
transactional Hook evidence.

## Modes

| Declaration                       | `deleteOne` / `deleteMany` | Commands                             |
| --------------------------------- | -------------------------- | ------------------------------------ |
| `softDelete: true`                | tombstone                  | the six commands                     |
| `softDelete: { mode: 'command' }` | hard delete                | the six commands                     |
| no `softDelete` key               | hard delete                | none, and no `isDeleted`/`deletedAt` |

The example's `Comment` keeps native deletes permanent:

<!-- region ../../examples/soft-delete/src/schema.ts#comment -->

```ts
/** Command mode: `deleteOne` stays permanent; `softDeleteOne` hides a row. */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({ body: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
})
```

<!-- endregion -->

In the default mode the logical delete keeps its Access, Hooks, audit, result
and transaction semantics; only the physical persistence plan becomes one
atomic update that sets `isDeleted: true` and `deletedAt` to the current time.
Native update policy, Hooks, validators, defaults and generators are not run.
Without `select` the delete returns `{ id }` (ADR-0341); with a selection
beyond `id`, Core checks the pre-delete record against the read rules, then the
delete returns the record as written (ADR-0306); `deleteMany` writes one tombstone per
target in one transaction, and one rejected item rolls back the batch.

## Commands

The many-row commands target every row matching a `where`:

<!-- region ../../examples/soft-delete/tests/lifecycle.test.ts#many -->

```ts
const hidden = await Post.softDeleteMany({
	where: { title: { startsWith: 'Draft' } },
	select: { deletedAt: true },
})

const back = await Post.restoreMany({
	where: { title: { startsWith: 'Draft' } },
})

await Post.softDeleteMany({ where: { title: { startsWith: 'Draft' } } })
const removed = await Post.purgeMany(
	{ where: { title: { startsWith: 'Draft' } } },
	{ useMasterKey: true },
)
```

<!-- endregion -->

| Command                            | Authority | Rows seen  | Writes                                |
| ---------------------------------- | --------- | ---------- | ------------------------------------- |
| `softDeleteOne` / `softDeleteMany` | request   | visible    | `isDeleted: true`, `deletedAt: now`   |
| `restoreOne` / `restoreMany`       | request   | tombstones | `isDeleted: false`, `deletedAt: null` |
| `purgeOne` / `purgeMany`           | Master    | tombstones | physical delete, returns the preimage |

`…One` commands take `{ id }`, `…Many` commands take `{ where }` and resolve to
one result per written row, in identifier order; both accept `select` and
`include`, and return `{ id }` without them, like any write (ADR-0341). A many-row command runs the one-row Access rule, Hooks and
readable-result check for each matching row inside one transaction, and one
refused row rolls the whole command back. With a selection beyond `id`,
`softDeleteOne` checks the read rules on the row before it hides it
(`checkReadable: 'before'`).

Request commands are ruled by the optional Access plugin under their own name
(`access.softDeleteOne`, `access.restoreOne`, …): restoration is closed when
the rule is absent and no `allowWithoutRule` key opens it (ADR-0317). Purge requires an audited
Master context; Master never bypasses Hooks. The Hooks plugin exposes
`beforeOperation`, `afterOperation` and `afterCommit` branches for every
command, and its `all` branch runs for each command first with `kind` naming
it.

The one-row request commands reach REST and GraphQL when the schema's rule
names them, `.with({ rest: { softDeleteOne: true, restoreOne: true } })` and
`.with({ graphql: { softDeleteOne: true, restoreOne: true } })`, as
`POST /api/classes/{Schema}/{id}/soft-delete-one` and `…/restore-one`, and as
the `softDeleteOne{Schema}` and `restoreOne{Schema}` mutations (ADR-0324,
ADR-0325). Many-row commands and purge have no route or field.

## Unique values

A tombstone keeps its data and its unique values, unless the application
declares a partial unique index on `isDeleted` in the `indexes` of `define`
(ADR-0303, ADR-0339); the plugin never adds one:

<!-- region ../../examples/soft-delete/src/schema.ts#article -->

```ts
/** A partial unique index lets a tombstone release its slug. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({ slug: field.string({ required: true }) }),
	indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
	softDelete: true,
})
```

<!-- endregion -->

A partial unique index declared in `.with` is a storage index, not a unique
target: `updateOne`, `deleteOne` and `upsertOne` cannot target a row by this
`slug`, so they target it by `id` (ADR-0332).

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

`softDelete` declares the schema permission `readDeleted` through Core
(ADR-0317). Reads by a caller who holds it skip the protected filter: they see
tombstones and can filter and sort them (`where: { isDeleted: { eq: true } }`,
`orderBy: { deletedAt: 'desc' }`), REST and GraphQL included. Updates, deletes
and commands never reach tombstones through it. With Access, grant it by a rule
of the same name or by its own `allowWithoutRule` key (`all`, `read` and
`write` never include it); a caller without it never sees tombstones, whatever
its `where`. The example grants it to moderators
(`readDeleted: hasRole(Moderator)` above), so this query returns the trash to a
moderator and nothing to anyone else:

<!-- region ../../examples/soft-delete/tests/trash.test.ts#read-deleted -->

```ts
const readTrash = () =>
	Post.findMany({
		orderBy: { deletedAt: 'desc' },
		select: { title: true },
		where: { isDeleted: { eq: true } },
	})
```

<!-- endregion -->

Master holds every permission, but its reads keep the trash filter by default:
a server job using `useMasterKey` never includes tombstones silently and needs
no `where: { isDeleted: false }`. A
Master read returns tombstones only when its own `where` constrains
`isDeleted`: any condition on this schema's `isDeleted`, at any depth of `AND`,
`OR` and `NOT` (a condition inside a relation predicate does not count):

<!-- region ../../examples/soft-delete/src/admin.ts#master-reads -->

```ts
/** Master reads keep the trash filter: live posts only. */
export const listLivePosts = () =>
	Post.findMany({ select: { title: true } }, { useMasterKey: true })

/** A Master read whose own `where` names `isDeleted` sees tombstones. */
export const listTrash = () =>
	Post.findMany(
		{
			orderBy: { deletedAt: 'desc' },
			select: { title: true, deletedAt: true },
			where: { isDeleted: true },
		},
		{ useMasterKey: true },
	)

/** Every row, live or deleted. */
export const countAllPosts = () =>
	Post.count(
		{ where: { isDeleted: { in: [true, false] } } },
		{ useMasterKey: true },
	)
```

<!-- endregion -->

This holds for `findMany`, `findOne`, `findOneOrThrow`, `count`, `exists`,
inclusions (with the inclusion's own `where`), REST and GraphQL. Restore and
purge keep reaching tombstones for Master and for allowed callers.

The package still imports neither Access nor any other policy plugin. A soft deletion triggers no referential action
(ADR-0299): a pointer to a tombstone keeps its value and its inclusion returns
`null` until a purge.

## Not yet

No deleter identity, reason, cascade policy, retention job, automatic purge or
nested soft delete.
