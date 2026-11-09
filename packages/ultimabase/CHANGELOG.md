# ultimabase

## 0.6.0

### Minor Changes

- 778bbbc: A plugin's own model relates to the application's user model through `AppUser`: `user: f.one(() => AppUser, { onDelete: 'cascade' })`. Startup resolves it to the model `defineUser` declares, and the user model gains no field. Auth's sessions and linked accounts, and password's hash and tokens, now hold their user this way, and the column `user_id` becomes a `uuid` with a foreign key to the user. Deleting a user through UltimaBase deletes them in its transaction. The foreign key does not cascade, since the kernel runs the cascades (D-54): a delete in raw SQL deletes them first, or fails at commit. Before `migrate deploy`, delete the rows whose user no longer exists, or the cast to `uuid` and the foreign key fail; with the user model stored in `"user"`:

  ```sql
  delete from "auth_session" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "auth_account" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "password_hash" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "password_token" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  ```

- 2bccedd: A completed caller is kept for the same identity until a model that a plugin with `caller` owns or is used by changes, a link from or to it included, so a role given or taken counts from the next request without reading the roles at every one. The feed gains `lost`, which an adapter calls when its changes may stop coming, before `missed`; a plugin takes it with a `lost(context)` part.
- 2f1baf1: A database the server cannot use answers `UNAVAILABLE`, not `INTERNAL` (D-335): every pool connection stayed busy, or the server cannot be reached. REST answers it with 503 and `Retry-After: 1`. GraphQL, as for every error, answers HTTP 200 with the code in `errors[].extensions.code` and `extensions.details.retryAfter`: a client that retries from the HTTP status reads the code instead. The reason is logged at `error`. `UNAVAILABLE` is now a kernel code.
- 945b1b3: `migrate deploy` and `reset` show, under `Applied <file>.`, the rows each `insert`, `update`, `delete` or `merge` statement of the file changed, `0` included:

  ```text
  Applied 20261108_orphans.sql.
    delete from "auth_session" as "row" where not exists (select from "user" where "…: DELETE 0
  ```

  An adapter's `migrations.apply(run, counted?)` takes a second parameter: `counted` hears `{ at, statement, command, rows }` for each such statement once its file is committed. An adapter that does not call it keeps working, and its deploys print no counts.

- 41b5dca: A required field added with a fixed default now keeps it as its column's default, where the plan dropped it in the same transaction. Code still running without the field can then still insert during a rolling deploy. A list without a default keeps `'{}'`. A change of the column's type drops the default. `migrate create` writes a comment below an added list that no default fills, so that the file says the stored rows hold it empty: `-- The stored rows hold an empty "Account.languages": fill them here if the model needs a value.`
- 41b5dca: A list takes `size: { min, max }`, as a `many` does: `f.enumOf(Language, { list: true, size: { min: 1 } })`. The bound holds after the hooks, so a `beforeCreate` may fill the list, and on what `push` and `remove` leave. A write outside it fails with `VALIDATION_FAILED`. PostgreSQL enforces it too, with a check of its own, and the schemas state it in the field's description.
- 0699e37: A create or an update that references a row another transaction is updating no longer waits for that transaction: on PostgreSQL an update locks its rows with `FOR NO KEY UPDATE`, as PostgreSQL's own update does, and only a delete keeps `FOR UPDATE`. An adapter's `Read.lock` and `Check.lock` are now `'update'` or `'delete'`, the new type `Lock`, in place of `true`.

### Patch Changes

- e97378e: `createMany` and `updateMany` on a model with an `after*` hook no longer read each row alone: 5000 rows take 0.2 s instead of 3.5 s on PostgreSQL. A hook still sees what an earlier hook wrote.
- f808da8: A delete that runs hooks or a cascade no longer slows down with the square of its rows: `deleteMany` of 20000 rows with a `beforeDelete` hook takes 0.3 s instead of 3.1 s.
- 7c20553: `updateMany` and `deleteMany` read back only the ids of the rows they count: on 200000 rows, twice and three times as fast.
- 4ff9d42: `memory()` tells realtime of a write of 120000 rows or more instead of crashing the process.
- 41b5dca: In `beforeCreate`, a field with a default is no longer `undefined` in the type of `data`: the hook runs after the defaults, so `data.status ?? 'inProgress'` can become `data.status`. A function default that may return `undefined` keeps its field possibly `undefined`, and so does a list without a default.
- 703ed93: Making an id is seven times cheaper, which takes 12 % off `createMany` of many rows.
- 76509c3: `memory()` finds a value in a long `in` list without comparing it with every item, so `updateMany` and `deleteMany` on a model with hooks no longer slow down with the square of their rows.
- a6394ba: A json value nested more than 1000 levels deep is refused, instead of running out of stack with a 500 (D-330): `VALIDATION_FAILED` in a write, `INVALID_QUERY` in a filter. REST answers them with a 400; GraphQL, as for every error, with its code in `errors[].extensions.code` and HTTP 200.
- ce7e68f: A live viewer ends again when its session is revoked or its user is deleted, and is rebuilt when one of its roles is taken away, though a request with the same token came first (D-343). Since the caller cache, a viewer built on a kept caller recorded no read and stayed open until its refresh, 300 s by default.
- d6ec5d4: A live list no longer stays wrong for good after concurrent writes, with rows missing or out of order or `hasMore` false: it refills from the sort keys it holds, not from where its last row has moved to.
- 0a6de4d: A live read with a virtual field costs less for each row it holds: with 1000 subscribers on a list of 1000 rows, the last of them hears of a write 31 % sooner.
- 1644bb1: Subscribers whose virtual fields read the same thing share one statement during a change: 1000 subscribers on one list went from 1002 statements a write to 3, and the last of them hears 53 % sooner.
- 12edcfd: A `memory()` write costs what it changes, no longer every row stored: one create with 100 000 rows stored takes 0.24 ms, where it took 14 ms, and a seed of 10 000 single creates 0.4 s, where it took 17 s. A read, update or delete by id tests only the rows it names. A failed write still changes nothing.
- a479bca: A nested `update`, `delete` or `connectOrCreate` on a list reads the rows its items name at once, where it read them one by one: 500 items take a third less time, and a `connectOrCreate` less than half. A unique index now types as the target of a nested write and of an include's `cursor`, as at the root.
- 0102aa8: A transaction whose database connection is lost rejects with the error that failed it, no longer with the error of the ROLLBACK the dead connection refuses: an error the callback throws, such as a `PublicError`, keeps its code.
- 7a8d0d8: A user's `update`, `delete` or `upsert` by a unique field, under rules that do not read `record`, no longer reads the row first: the rules' filters are checked in the write's own statement, one round trip instead of five, 70 % faster on PostgreSQL. A rule that reads `record` still gets the row, and the errors do not change. An update that sets none of the fields its rule's filter reads skips the count after the write.
- e3d051f: A nested `set` of 120000 rows or more links and unlinks them instead of failing.
- 6140b2b: An update by a unique field other than `id`, such as `slug`, and the update branch of an `upsert` load no row when nothing needs it: one round trip instead of four, 60 % less time. An `upsert` that creates takes two round trips instead of four.

## 0.5.0

### Minor Changes

- efc5f10: A live list counts a nested `many` at the smaller of its `take` and its
  `size.max`: `images(first: 100)` on a `size: { max: 10 }` relation counts 10
  rows toward `maxLive`, not 100. A model's `ExposedModel` lists its bounded
  relations as `sizes`.
- fa67fd3: `f.many(() => Membership, { inverse: false })` declares a many-to-many on
  one side only: its target gets no field, and no transport publishes one. It
  reads, writes, filters, counts and sorts as any many-to-many, takes
  `within`, and refuses `size`. `postgres()` names its join table after the
  declared side, `task_assignees`. Live queries follow it (D-248).
- 3646c66: A `one` view whose filter is only `{ user: { viewer: false } }` reads the
  other row of a pair: a member reads the other member, anyone else `null`.
  Its `many` takes `size: { max: 2 }` and the target a unique index on the key
  and the relation. A `one` view that finds two rows fails the read (D-249).

### Patch Changes

- 20e2cc5: `f.enumOf(undefined)` names its likely cause: two model files importing each
  other, one reading the other's values before they are defined.
- 9e34dc6: A `sync` refusing to drop a field a `oneOf`'s key may be no longer suggests a `dbName` the `oneOf` refuses: it says `sync --force` loses the data and `migrate create` writes the rename.
- 05cc9ce: `migrate create`'s hint for a table that looks renamed, a model's or a join's, now renames its keys and indexes too, one statement per line: following it gives the database a fresh sync gives. It renamed the table alone, which kept the old key and index names, and a join that moved to its other side kept its old key order, so the next migration failed.

## 0.4.0

### Minor Changes

- 4c2d462: Every field builder and `defineFunction` take `deprecated`, a non-empty
  string that says why clients should stop using it and what replaces it.
  GraphQL shows `@deprecated(reason:)` on the field in the model's types and
  inputs, on a virtual field and on a function's field; OpenAPI shows
  `deprecated: true` with the reason ending the description. Only a field a
  create may leave out is deprecated: on a required one, `deprecated` fails to
  compile and stops the start (D-216).
- 7accc26: Each plugin declares the codes its errors carry in its types' `errors`, and `ultimabase` exports `ErrorCodeOf<typeof app>`: the kernel's codes and those of each plugin the application lists, for a client to type its messages against (D-206). A GraphQL document the schema refuses, as an unknown field, now carries `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query.
- 783fc4b: `f.exists(target, { from })` declares a read-only boolean: whether the view
  of that `many`, filtered in `.with({ relations })`, keeps a row for the
  caller. `select` and `include` take `true`, and `where` takes `true` or
  `false`; it sorts nothing, is not counted and is not written. GraphQL reads a
  `Boolean!` and filters on a `Boolean`; REST and OpenAPI read and filter a
  `boolean` (D-246).
- 8dca2cf: `ultimabase generate` writes the files plugins declare with the new `generate` hook, without starting the database or opening a port; `--check` exits 1 when one is out of date, for CI. The GraphQL plugin's `generated` schema file goes through it, and `ultimabase dev` now logs `Wrote <path>.` for it (D-201).
- 4e1a966: `httpPlugin` answers `GET /health` and `GET /ready`, before every route.
  `/ready` answers 503 until every plugin started, once the stop began, and
  while a check a plugin added with `plugins.http.ready(check)` fails. On
  `stop`, the server keeps serving for `drain` milliseconds, 5000 in
  production, before the plugins stop. Plugins get two hooks: `started`, once
  every plugin started, and `stopping`, before any plugin stops (D-204).
  Until every plugin started, every other request and upgrade answers 503
  `UNAVAILABLE`, Master's too (D-207).
- 11b7633: `IssueCodeOf<typeof app>` types the codes the plugins give a
  `VALIDATION_FAILED` issue, which a plugin declares in its types' `issues`.
  The password plugin declares `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and
  `PASSWORD_BREACHED` (D-231).
- b65eb74: A `many` facing a `one` takes `size: { min, max }` (D-242): each parent a
  write or a transaction touches holds `min` to `max` rows at its end, or the
  write is refused with `RELATION_SIZE`, `details: { model, field, id, min,
max, size }`, and nothing of it is kept. Every path counts: nested and bulk
  writes, moves from either side, deletes, cascades and `setNull`; deleting
  the parent is never refused by its own bound. Each write locks the parents
  it touches, so concurrent writes cannot pass the bound together. A
  many-to-many or a view with a `size` is refused by the types and at startup.
  HTTP sends `RELATION_SIZE` as 409, and the GraphQL and OpenAPI schemas state
  the bound in the field's description: `Holds 2 to 4 rows.`
- 1354efd: `.commands<T>(build)` adds the application's commands to a model, typed by
  its interface: `Match.end(id)` next to `Match.update(…)` (D-217). They run
  on the server only. A plugin's command named `paginate`, `paginated` or
  `commands` is now refused instead of being overwritten by the model's method.
- b994e6e: `Model.exists({ where }, options)` says whether the caller reads a row
  `where` selects, reading at most one; server code only (D-244).
- fb807e1: An optional one-to-one moves from the side without the key (D-239). When the
  side that stores the key is optional, `connect`, `create` and `disconnect`
  from the other side leave the old row with no key instead of failing with
  `… cannot be left without one.` From the side that stores the key, connecting
  a row another row holds stays a `UNIQUE_VIOLATION`.
- 69699b2: A relation's other side is named, never found by itself (D-237). A `one`
  without `inverse` stores its key and its target gets no field:
  `author: f.one(() => User)` no longer asks `User` for a `many`. A `many`
  names its other side with `inverse`, which the types require:
  `posts: f.many(() => Post, { inverse: 'author' })`, and both sides of a
  many-to-many name each other. In a one-to-one, the optional side names the
  other and stores no key; the side it names stores the key. The user model of
  `defineRole` lists its roles in
  `roles: f.many(() => Role, { inverse: 'members' })`. GraphQL and OpenAPI give
  a one-sided `one` its target's whole input, `UserCreateNestedOneInput`.
  `StoredRecord` and the types built on it lose their second parameter.
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
- d76e882: A `one` view's filter can pin a relation to the user model with
  `viewer: true`, at its top level: each signed-in user reads their own row,
  and a visitor and Master read `null`. A unique index on the target's key and
  the pinned relations holds the row single; startup refuses `viewer: false`
  and a `viewer` inside `OR`, `NOT` or a nested relation (D-245).
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
- 1d7fda8: `ultimabase` exports `QueryOptions`, the `{ as }` every query, model command
  and `fn.run` take; auth, files and password use it instead of their own
  copies.
- a778695: A field with a read rule is optional in the rows a query returns, in a
  `select` and an `include` too: `post.title` reads `string | undefined`, as
  the row leaves it out when the rule hides it (D-199). `allow.public` and
  `allow.readOnly` are no read rule, so their fields stay required.
- adafb1a: A `one` relation takes `within`, which keeps its target in the row's parent:
  `within: 'project'` refuses a task whose milestone belongs to another project,
  and `within: { project: 'id' }` a project featuring another project's
  milestone (D-220). The write is refused with `VALIDATION_FAILED`, its issue on
  the field it moved. `postgres()` keeps it too, with a composite foreign key
  checked at commit.
- 2afc370: A rename hint lists every added column a removed one may be, and never names one added column for two removals (D-232).
- c9a8228: The types check the field names of `from` and `within` (D-238). A view's
  `from` names a `many` of its model that stores its rows, or fails on the
  field; the target's side of a `within` names a field of the target, or
  fails on `defineApp`, as an unknown `inverse` does. The startup checks are
  unchanged.
- 644a24f: `within` needs no `many` of the parent (D-243): a `one` or a many-to-many kept within a parent starts when nothing names the target's `one` to it. A write that links a target whose parent it does not hold reads that parent by key first, in its transaction.
- 6c1cfe5: A model's `create`, `update`, `delete` or `write` rule may return
  `where(filter, error?)`, as a read rule does (D-214). An update's row matches
  the filter before and after the write, a delete's before, a create's after,
  with the relations it connects or creates; a row outside it refuses the whole
  write with the given `PublicError`, or `ACCESS_DENIED`. `isOwner` still tells
  a read rule from a write rule now that both receive `where`.

### Patch Changes

- 67d5152: `asUser` takes the user's row as a sign-up or a Master read returns it, whose
  read-ruled fields are optional, instead of refusing it (D-203). A user's
  `email` and `passwordSetAt` are optional in the rows a read returns, since
  only the user and Master read them; `ultimabase` exports `UserRowOf` and
  `Hidden` for it.
- f38d1fb: A filter nests at most 32 levels: deeper, it answers `BAD_USER_INPUT` instead of running out of stack with `INTERNAL` (D-228).
- e4c1252: `httpPlugin()` limits each client address to 600 requests and upgrades a
  minute, answering 429 `TOO_MANY_ATTEMPTS` with `Retry-After` past it, before
  any session is read (D-218). `rateLimit: { requests, window }` changes the
  limit and `rateLimit: false` turns it off. An IPv6 address counts by its /64;
  a local or private address is never counted; the master key passes.
- 6f37f70: A schema's issue keeps its code when it is in capitals, as `NAME_LENGTH`;
  a library's, as Zod's `too_small`, is left out. The password's refusals
  carry `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and `PASSWORD_BREACHED`, and
  within a function they share the input's path, as
  `['input', 'newPassword']` (D-224).
- 9b491fb: A live read plans its rows' read once per caller, its read rules and `beforeFind` included, instead of on every write it follows, opens with one query of the fields it needs, and keeps each row as its sort keys alone (D-195). A write followed by 10 000 subscribers on one list of 25 rows sends its last message in about 155 ms instead of 260; a subscription to 1000 rows holds 163 KiB instead of 305, and 10 000 of them open in 28.5 s instead of 54.
- 9b491fb: A lost right re-checks only the live reads it may reach (D-196). A delete in the feed tells the stored `one` keys of each deleted row, and a write through a read rule's relation is judged by that level's own conditions: with 10 000 subscribers, a deleted member row or a user leaving a role costs 4 statements instead of 10 000 to 20 000, and the engine is done in under 190 ms instead of 3.6 to 7.4 s. The subscriber who loses rows hears of it after about 150 to 190 ms instead of 65 to 75.
- e61e1c2: `POST /_ultimabase/reset` no longer fails with `deadlock detected` when a
  request writes while it runs: it waits for the running requests and holds
  new ones until the database is empty, and fails after 5 seconds rather than
  waiting forever.
- 844627a: A many-to-many written from its other side runs this side's field rule too,
  and only Master gives a role: a user who may edit their own row no longer
  becomes an Admin by connecting `roles` (D-213).
- eb6dbbf: A transaction rolls back or commits only once every query in it has settled
  (D-208): a query that fails beside others of a `Promise.all` no longer sends
  `ROLLBACK` while they still wait on the connection, which `pg` warned of.
  A query the callback does not wait for belongs to the transaction from its
  call.
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

## 0.3.0

### Minor Changes

- 41cfff6: `ultimabase dev`, `sync`, `reset` and `migrate create` load the `.env` file beside the config; `start`, `migrate deploy` and `migrate status` never read it (D-171).
- 6e8ebf6: `testApplication` returns `feed.missed()`, which calls each plugin's `missed` during a test (D-168).
- 760560a: A query function can return a page of a model (D-182): its output is `Model.paginated()`, at the root or in a `defineType` field, and `run` returns `Model.paginate({ where, orderBy }, { as })`. GraphQL serves the model's connection with its page arguments, REST answers as the model's list route, with flat parameters at the root and one JSON parameter named by the field's path in a type; `totalCount` is counted only when asked. A page cannot be live.
- 21b52bc: A non-unique index names `id`, `createdAt` and `updatedAt`, as `indexes: [{ fields: ['room', 'createdAt', 'id'] }]`; a unique index still refuses them (D-174).
- 134d951: A `validate` function that throws a `PublicError` gives its issue the error's `code`, next to its message, over REST and GraphQL too.
- bc4d6de: `definePlugin` takes no `manifest` for a plugin of the application: its
  versions are not checked and it logs no warning. A published plugin still
  passes its `package.json` (D-172).
- 9cd2dd4: `ultimabase` exports `PluginContext<T>`, the context of a plugin's `start`, `stop`, `api`, `identify`, `caller`, `changed` and `missed`, to type a helper they share (D-167).
- f33c16f: A field with `allow.public` or `allow.readOnly` has no read rule: every caller filters, sorts and searches on it, and GraphQL and OpenAPI type it non-null when it is required; writes to it are checked as before (D-176).
- b06627c: Outside production, `POST /_ultimabase/reset` with the master key empties every model's rows and keeps the tables, for end-to-end tests; an adapter gains a required `empty()`, which the contract suite checks (D-188).
- 8ce42f6: `transaction(run, { isolation: 'serializable' })` runs a serializable transaction, and runs `run` again when the database aborts it for a conflict with another, after a random wait that grows with each attempt, 10 attempts at most (D-183); the tenth conflict fails with the new code `CONFLICT`, status 409 over HTTP (D-179). An adapter's `begin` takes `{ isolation: 'serializable' }`, throws when it cannot hold it, and reports a conflict as `Conflict`: PostgreSQL reports `40001` and `40P01`. `testAdapter` checks that two serializable transactions reading what the other writes never both commit.
- 353c2bf: A string field takes `unique: 'insensitive'`, and a unique index `mode: 'insensitive'`: `Alice` then clashes with `alice`, while each row keeps its case, and the `UNIQUE_VIOLATION` names the field (D-170). `postgres()` makes a unique index over `lower()`, which also serves an insensitive `equals`: run a migration after the upgrade to add it. `@ultimabase/testing` checks an adapter's case-insensitive keys.
- a7588c3: `viewer: true` on a relation to the user model filters by the signed-in user, in server code, access rules, GraphQL and REST; `false` keeps the other rows, and a caller with no user matches no row with `true` (D-189).
- 714d3bb: A virtual's `needs` takes a stored `one` relation, which `run` reads as its key, `{ id }`, with no extra query (D-184).

### Patch Changes

- 7530d07: `createMany` checks the rows its records connect in one count per target model, so thousands of rows with a `connect` no longer fail on PostgreSQL with "target lists can have at most 1664 entries".
- 1195207: A live row or list that selects a virtual field follows what its `run` or `runMany` read: a write to one of those rows sends again, with their new value, only the rows whose value changed (D-187).
- b1bc387: `signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`
- aaf123c: A misspelt name in a virtual's `needs` fails to compile on the virtual's line, with the closest name suggested, and no longer turns `run`'s parameters into an implicit `any` (D-180).

## 0.2.0

### Minor Changes

- 2c3bf4e: A `one` relation read through `include` or `select` is typed `Target | null`, required relations included: it reads `null` when a read rule hides its target or the target is soft-deleted, which the type did not say. Code that reads such a relation now handles `null`, as in `message.author?.name`.
- fd1263e: A plugin's context gives `dependents`, the plugins that require it, and auth warns at start when no sign-in method requires it (D-164).

## 0.1.2

No changes in this release.

## 0.1.1

### Patch Changes

- The published starter starts: `ultimabase dev` runs `dist/serve.js`, and `@ultimabase/realtime`, which `@ultimabase/graphql` and `@ultimabase/rest` import, is a required peer the starter lists.

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.
