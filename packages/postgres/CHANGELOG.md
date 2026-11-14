# @ultimabase/postgres

## 0.8.0

### Patch Changes

- 65852ad: `migrate create` writes a note below a statement that makes code still running without a new field fail to insert during a rolling deploy: the `set not null` of a required field without a fixed default, and the size check whose minimum refuses the empty list a new column keeps. The note says to make that change in a later deploy.
- 1520a09: The kernel publishes each model operation, hook, virtual field and function on Node's tracing channels `ultimabase:operation`, `ultimabase:hook`, `ultimabase:virtual` and `ultimabase:function`, nested, and each error the server logs at error level on `ultimabase:error` with its correlation id. A tool such as an error tracker subscribes to them; without a subscriber, nothing is built.
- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0

## 0.7.0

### Minor Changes

- 1f34e7a: Two `migrate deploy` of different code at the same time no longer leave the older snapshot stored,
  which made every production start refuse: the deploy that read the database before the other ran
  is refused with `Another deploy changed the database meanwhile: deploy again.`, and applies no file
  of its own after the other's. Identical deploys, such as replicas deploying at start, still pass.

  For adapter authors: a deploy `Run` holds `known`, every file name the code holds. `apply` refuses
  the deploy, under its lock, when the database applied a file `known` does not name.

### Patch Changes

- 1f34e7a: An aggregate outside a transaction tests a stored key's target with one id on the key itself, as `findMany` and `count` do (D-320): PostgreSQL plans it without an `exists` per relation.
- 1f34e7a: A delete on a model of more than 99 stored keys, or of long key names, no
  longer fails: its change then tells the ids alone.
- 1f34e7a: A deploy is refused when another deploy applied a file of the same name and
  other content meanwhile, instead of skipping that file.
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
  - ultimabase@0.7.0

## 0.6.0

### Minor Changes

- 2f1baf1: A database the server cannot use answers `UNAVAILABLE`, not `INTERNAL` (D-335): every pool connection stayed busy, or the server cannot be reached. REST answers it with 503 and `Retry-After: 1`. GraphQL, as for every error, answers HTTP 200 with the code in `errors[].extensions.code` and `extensions.details.retryAfter`: a client that retries from the HTTP status reads the code instead. The reason is logged at `error`. `UNAVAILABLE` is now a kernel code.
- 945b1b3: `migrate deploy` and `reset` show, under `Applied <file>.`, the rows each `insert`, `update`, `delete` or `merge` statement of the file changed, `0` included:

  ```text
  Applied 20261108_orphans.sql.
    delete from "auth_session" as "row" where not exists (select from "user" where "…: DELETE 0
  ```

  An adapter's `migrations.apply(run, counted?)` takes a second parameter: `counted` hears `{ at, statement, command, rows }` for each such statement once its file is committed. An adapter that does not call it keeps working, and its deploys print no counts.

- 41b5dca: A required field added with a fixed default now keeps it as its column's default, where the plan dropped it in the same transaction. Code still running without the field can then still insert during a rolling deploy. A list without a default keeps `'{}'`. A change of the column's type drops the default. `migrate create` writes a comment below an added list that no default fills, so that the file says the stored rows hold it empty: `-- The stored rows hold an empty "Account.languages": fill them here if the model needs a value.`
- 41b5dca: A list takes `size: { min, max }`, as a `many` does: `f.enumOf(Language, { list: true, size: { min: 1 } })`. The bound holds after the hooks, so a `beforeCreate` may fill the list, and on what `push` and `remove` leave. A write outside it fails with `VALIDATION_FAILED`. PostgreSQL enforces it too, with a check of its own, and the schemas state it in the field's description.
- a47bbc4: The adapter plans a statement it composes once per connection, where PostgreSQL planned it on every run. A pooler that shares server connections between clients may then find a statement unknown: PgBouncer in transaction mode needs version 1.21 or later and `max_prepared_statements` above 0. Where it cannot, `postgres({ url, prepared: false })` plans each statement every time.
- d23caa0: `postgres({ url, statementTimeout: 10_000 })` ends a statement that runs longer than 10 s, a wait for a lock included, and gives up a connection whose statement has no answer 10 s past it, with or without realtime. Migrations run unbounded. Unset, nothing changes.

### Patch Changes

- 3b5f432: A transaction's `BEGIN` no longer waits for its answer before the first statement, which takes a round trip off every write in a transaction: 12 to 22 % on PostgreSQL next door, 17 to 26 % at 2 ms. A database behind a pooler (`prepared: false`) keeps waiting.
- de31d62: A read outside a transaction tests a relation to one id, as `viewer: true` in a rule, on its key alone, which PostgreSQL plans faster. A read of 25 campaigns under rules holding seven such relations went from 3.5 to 2.9 ms.
- 571f79c: A read from a cursor starts at its row when an index serves its order, so paging through 100 000 rows takes 1.7 s instead of 25.8 s; results do not change.
- 6689a16: A connection past its 500 prepared statements no longer aborts the transaction it is in, behind a pooler in transaction mode such as PgBouncer: it deallocates the statements it dropped after the transaction's end, and gives up on a name the server does not know instead of trying it again on every query.
- a9a48a6: Deletes of distinct rows by id share one statement, where each ran its own: a nested `delete` of 500 items takes 64 % less time.
- cff9f88: Several `migrate deploy` at once no longer deadlock on a file that creates an index concurrently, which could leave that index invalid.
- 1913db3: The change feed checks that it hears its own notifications (D-337). Behind a pooler in transaction mode, such as PgBouncer, it hears nothing: it now logs one error naming the cause, and the caller cache is bypassed instead of kept stale.
- 2bccedd: The change feed calls `lost` as soon as its listener loses its connection, before `missed` once it listens again.
- df8f65f: A quiet server keeps its database connections for 5 minutes instead of 10 s, so the first read after a pause takes 2.5 ms instead of 11.5 ms next door, and 5 ms instead of 22 ms at 2 ms. A script that forgets `app.stop()` now ends at once instead of 10 s later.
- 2e80df7: An include that selects the `id` of a `one` relation, or of a `many` through a join, alone reads the foreign keys instead of the target's rows, outside a transaction and when no read rule or trash filters the target: a list of 100 rows with its authors' and tags' ids reads about 20 % faster.
- af3b612: A filter on an optional inverse relation, as `featuredBy: { isNot: null }` inside an `OR`, no longer reads every row of the other table. A read of 25 campaigns under such a rule went from 4.6 to 3.5 ms with 20 000 users, and from 12.4 to 3.5 ms with 100 000.
- 39486de: An `in` or `notIn` of more than 65535 values, and a many-to-many `connect` or `disconnect` of more than 32767 targets, no longer fail with `bind message has … parameter formats but 0 parameters`: a list of values is one parameter. Reads by lists of ids of changing length, as the realtime engine makes them, are planned once: 12 to 14 % faster for lists of a few hundred ids.
- 18e07ef: A test on the declared database starts in about half the time: a test file keeps its connections from one test to the next.
- 4001564: On a test file's own schema, the change feed's listener connects alongside the pool: a 22-model application with realtime starts and stops around a test in 39 ms where it took 47 ms.
- ae3d38f: A silent database is given up as soon as its silence is over, where it could wait for the next event on the server: a silence of 1 s cut waiting requests after 3.5 s in the tests, after 1 s now.
- ee2ed85: A database that goes silent with no one told, as after a failover to a new address, no longer freezes realtime and waiting requests until a restart: within about 20 s they fail, a warning says so, and realtime comes back.
- 68afa4a: A sync sends its statements in one round trip: a 22-model application starts on an empty PostgreSQL database in 158 ms where it took 213 ms.
- c19a118: A test on the declared `postgres()` database starts faster: one `delete` empties the test file's tables instead of a `truncate`, and a start no longer creates the schema it already found. A 22-model application starts and stops around a test in 44 ms, where it took 60 ms.
- a898f52: A connection no longer keeps a prepared statement it was told to drop inside a transaction that had failed. Before, each such statement stayed on the server until the connection closed, past the 500 a connection keeps.
- 2100e7a: A connection keeps prepared the statements it used last. Before, the first 500 kept their room until a restart, so that one visitor sending 500 different filters slowed every later statement by 18 to 38 %.
- 18e88bb: A read builds its rows as `json`, and no longer numbers them: a nested list of 25 rows costs PostgreSQL about 20 % less time, a list of 50 000 rows about 46 % less time and memory.
- a47bbc4: A write costs its readers: it visits only the reads it can concern, and runs fewer statements. Subscribers of one row share its execution, a document is validated once, and a message is compressed only above 2 KB.
- c021045: A query that binds more than 65535 values, such as an `OR` of 70000 conditions, now fails saying so and how to write it, instead of with `bind message has … parameter formats but 0 parameters`.
- 0699e37: A create or an update that references a row another transaction is updating no longer waits for that transaction: on PostgreSQL an update locks its rows with `FOR NO KEY UPDATE`, as PostgreSQL's own update does, and only a delete keeps `FOR UPDATE`. An adapter's `Read.lock` and `Check.lock` are now `'update'` or `'delete'`, the new type `Lock`, in place of `true`.
- 822c2ad: Updates of distinct rows by id that set no unique, partial-index or relation key share one statement, where each ran its own: a nested `update` of 500 items takes 59 % less time.
- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [41b5dca]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [d6ec5d4]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0

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
