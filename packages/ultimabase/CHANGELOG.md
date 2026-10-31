# ultimabase

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
- 8ce42f6: `transaction(run, { isolation: 'serializable' })` runs a serializable transaction, and runs `run` again when the database aborts it for a conflict with another, after a random wait that grows with each attempt, 10 attempts at most (D-183); the tenth conflict fails with the new code `CONFLICT`, status 409 over HTTP (D-179). An adapter's `begin` takes `{ isolation: 'serializable' }`, throws when it cannot hold it, and reports a conflict as `Conflict`: PostgreSQL reports `40001` and `40P01`. `testAdapter` checks that two serializable transactions reading what the other writes never both commit.
- 353c2bf: A string field takes `unique: 'insensitive'`, and a unique index `mode: 'insensitive'`: `Alice` then clashes with `alice`, while each row keeps its case, and the `UNIQUE_VIOLATION` names the field (D-170). `postgres()` makes a unique index over `lower()`, which also serves an insensitive `equals`: run a migration after the upgrade to add it. `@ultimabase/testing` checks an adapter's case-insensitive keys.

### Patch Changes

- 7530d07: `createMany` checks the rows its records connect in one count per target model, so thousands of rows with a `connect` no longer fail on PostgreSQL with "target lists can have at most 1664 entries".
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
