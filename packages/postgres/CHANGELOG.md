# @ultimabase/postgres

## 0.5.0

### Minor Changes

- fa67fd3: `f.many(() => Membership, { inverse: false })` declares a many-to-many on
  one side only: its target gets no field, and no transport publishes one. It
  reads, writes, filters, counts and sorts as any many-to-many, takes
  `within`, and refuses `size`. `postgres()` names its join table after the
  declared side, `task_assignees`. Live queries follow it (D-248).

### Patch Changes

- 3646c66: A `one` view whose filter is only `{ user: { viewer: false } }` reads the
  other row of a pair: a member reads the other member, anyone else `null`.
  Its `many` takes `size: { max: 2 }` and the target a unique index on the key
  and the relation. A `one` view that finds two rows fails the read (D-249).
- 05cc9ce: `migrate create`'s hint for a table that looks renamed, a model's or a join's, now renames its keys and indexes too, one statement per line: following it gives the database a fresh sync gives. It renamed the table alone, which kept the old key and index names, and a join that moved to its other side kept its old key order, so the next migration failed.
- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0

## 0.4.0

### Minor Changes

- 4b37376: `f.oneOf({ post: () => Post, photo: () => Photo }, options)` declares a
  relation to one row of one of its kinds, each kind's model naming it back
  from a `many`. A row reads `{ kind: 'photo', photo: { ... } }`, which
  TypeScript narrows on `kind`; a write names its kind, as
  `{ connect: { photo: { id } } }`; a `where` filters through a kind, through
  the fields every kind shares, or by `kind`. `postgres()` stores a foreign key
  per kind and a check that one is set. GraphQL serves an object type,
  `CommentTarget { kind, post, photo }`, with its filter and `@oneOf` inputs;
  REST and OpenAPI take and type the same shapes; live queries follow it
  (D-247).
- ebdf8a0: A `one` view reads the one row of a one-to-many `many` that its filter keeps,
  or `null` (D-240): `upcoming: f.one(() => Volume, { from: 'volumes' })`,
  filtered in `.with({ relations: { upcoming: { where: ({ where }) =>
where({ released: false }) } } })`. The filter runs once, at startup, and
  reads no caller; a unique index on the target's key, with a `where` the
  filter keeps, must hold the row single, or the application does not start.
  The view is read like a `one`, by include, select and `is`, `isNot` and
  `is: null`; it is not written and sorts nothing. GraphQL publishes it as a
  nullable field, and OpenAPI leaves it out of inputs and `orderBy`. The
  memory adapter's include of a `one` with a filter reads the first row it
  keeps.
- b5c22b0: A unique index takes `where`, a filter of values, `null`, `equals` and
  `not` on the model's scalar fields: the rows it keeps share no values, the
  others are never in conflict. `postgres()` creates a partial unique index,
  and `memory()` checks the same rows. `where: { deletedAt: null }` lets a
  new row take the unique value of a soft-deleted one (D-215).
- adafb1a: A `one` relation takes `within`, which keeps its target in the row's parent:
  `within: 'project'` refuses a task whose milestone belongs to another project,
  and `within: { project: 'id' }` a project featuring another project's
  milestone (D-220). The write is refused with `VALIDATION_FAILED`, its issue on
  the field it moved. `postgres()` keeps it too, with a composite foreign key
  checked at commit.

### Patch Changes

- 2442223: A `check` constraint of the application's own that refuses a row returns
  `VALIDATION_FAILED`, one issue naming the constraint, instead of `INTERNAL`
  (D-219).
- 9b491fb: A lost right re-checks only the live reads it may reach (D-196). A delete in the feed tells the stored `one` keys of each deleted row, and a write through a read rule's relation is judged by that level's own conditions: with 10 000 subscribers, a deleted member row or a user leaving a role costs 4 statements instead of 10 000 to 20 000, and the engine is done in under 190 ms instead of 3.6 to 7.4 s. The subscriber who loses rows hears of it after about 150 to 190 ms instead of 65 to 75.
- 9b491fb: A read returns its dates as milliseconds since the epoch and decodes its rows in place, without copying them: 10 000 subscriptions to lists of 1000 rows open in 40 s instead of 52. A date stored with microseconds by another writer rounds down to its millisecond, before 1970 too.
- e55affe: A relation has no index of its own when a unique key or an index of its model starts with its column; the next sync or migration drops the extra one (D-234).
- 2afc370: A rename hint lists every added column a removed one may be, and never names one added column for two removals (D-232).
- 501c0cb: A many-to-many takes `within: 'project'` on one side: every row it links has
  the row's `project`, and a write that links two rows of different projects,
  from either side, or moves a linked row to another project, is refused with
  `VALIDATION_FAILED` (D-236). `postgres()` stores each link's parent in the
  join table, with a foreign key per side, `on update cascade`, checked at
  commit; `migrate create` fills the column and adds the keys.
- efc4303: A relation kept `within` a parent links no target while the row's parent is
  unset: the write is refused with the relation's usual issue, and so is
  emptying the parent while a target is linked. A delete that empties the
  parent empties the target first. `postgres()` adds a `_within_check` beside
  the `within` key when the parent is optional (D-235).
- Updated dependencies [67d5152]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4e1a966]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
- Updated dependencies [b5c22b0]
- Updated dependencies [1d7fda8]
- Updated dependencies [a778695]
- Updated dependencies [adafb1a]
- Updated dependencies [2afc370]
- Updated dependencies [e61e1c2]
- Updated dependencies [844627a]
- Updated dependencies [eb6dbbf]
- Updated dependencies [c9a8228]
- Updated dependencies [501c0cb]
- Updated dependencies [644a24f]
- Updated dependencies [efc4303]
- Updated dependencies [6c1cfe5]
  - ultimabase@0.4.0

## 0.3.0

### Minor Changes

- b06627c: Outside production, `POST /_ultimabase/reset` with the master key empties every model's rows and keeps the tables, for end-to-end tests; an adapter gains a required `empty()`, which the contract suite checks (D-188).
- 8ce42f6: `transaction(run, { isolation: 'serializable' })` runs a serializable transaction, and runs `run` again when the database aborts it for a conflict with another, after a random wait that grows with each attempt, 10 attempts at most (D-183); the tenth conflict fails with the new code `CONFLICT`, status 409 over HTTP (D-179). An adapter's `begin` takes `{ isolation: 'serializable' }`, throws when it cannot hold it, and reports a conflict as `Conflict`: PostgreSQL reports `40001` and `40P01`. `testAdapter` checks that two serializable transactions reading what the other writes never both commit.
- 353c2bf: A string field takes `unique: 'insensitive'`, and a unique index `mode: 'insensitive'`: `Alice` then clashes with `alice`, while each row keeps its case, and the `UNIQUE_VIOLATION` names the field (D-170). `postgres()` makes a unique index over `lower()`, which also serves an insensitive `equals`: run a migration after the upgrade to add it. `@ultimabase/testing` checks an adapter's case-insensitive keys.

### Patch Changes

- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [1195207]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [b06627c]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
  - ultimabase@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
  - ultimabase@0.2.0

## 0.1.2

### Patch Changes

- ultimabase@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - ultimabase@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - ultimabase@0.1.0
