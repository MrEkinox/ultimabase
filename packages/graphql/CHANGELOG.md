# @ultimabase/graphql

## 0.6.0

### Patch Changes

- a47bbc4: A storm of connections no longer fails. The server's connection queue holds 4096, and at most 8 connections open at once. A socket closed by a failure of the server now gets `1013`, which `graphql-ws` retries, where it got `4403`: `4403` now means refused, and only that. `liveFetch` reconnects at a random moment of its wait, so that clients cut together do not come back together.
- dcfc0e6: A live list kept for a resume holds no more than its window costs: past
  that, its resume gets the window whole.
- 512bf58: A closed WebSocket no longer keeps its completed live lists for 10 seconds: they end at once, as no resume can reach them. A storm of closing connections held about 24 KiB a socket until then.
- a47bbc4: A write costs its readers: it visits only the reads it can concern, and runs fewer statements. Subscribers of one row share its execution, a document is validated once, and a message is compressed only above 2 KB.
- 104bcf8: A WebSocket client's invalid or oversized frame closes its own socket, with the code for it, and no longer stops the server.
- b733636: A WebSocket subscription id used twice closes the socket with 4409 however long the id is, and no longer logs an error.
- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [a47bbc4]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [a47bbc4]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [9d5dee3]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [f25bb39]
- Updated dependencies [41b5dca]
- Updated dependencies [3d7f654]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [da11cfa]
- Updated dependencies [c5ddcbd]
- Updated dependencies [d6ec5d4]
- Updated dependencies [08ce21c]
- Updated dependencies [ed78183]
- Updated dependencies [bce3bbe]
- Updated dependencies [0ce209d]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [dfa430e]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [627ce40]
- Updated dependencies [a47bbc4]
- Updated dependencies [10a1c8c]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0
  - @ultimabase/realtime@0.6.0
  - @ultimabase/http@0.6.0

## 0.5.0

### Patch Changes

- 4bb96ea: A function whose output is a model re-reads the `f.exists` fields its query
  selects, as it does its relations: `follow(…) { id isFollowed }` no longer
  fails with an internal error.
- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0
  - @ultimabase/realtime@0.5.0
  - @ultimabase/http@0.5.0

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

### Patch Changes

- 9c6ca70: A connection asking for its `totalCount` alone reads no row: over GraphQL
  when neither `edges` nor `pageInfo` is selected, or with `first: 0`; over
  REST and live with `first=0&totalCount=true` (D-226).
- 3b8c19b: A model whose only fields are relations, or that has none, no longer breaks
  the GraphQL schema: the inputs GraphQL cannot take are left out. A schema
  that is still invalid refuses the start, and an error a request throws is
  logged by the application's logger.
- f38d1fb: A filter nests at most 32 levels: deeper, it answers `BAD_USER_INPUT` instead of running out of stack with `INTERNAL` (D-228).
- 8d4b29f: A function's returned row keeps the virtual fields `run` returned, over GraphQL and REST as from server code; only the ones it left out are computed (D-109).
- 4fba06b: Each operation sent over a GraphQL WebSocket counts as a request of its
  address: over the limit it fails with `TOO_MANY_ATTEMPTS` and
  `details.retryAfter`, and the socket stays open. `Upgrade` gains `limit()`,
  which counts one more request for a plugin's own socket (D-230). A live
  function's subscription is refused past `maxRows`, as its query over HTTP
  (D-229). A value graphql-js cannot send, as an `Int` above 2³¹, is an
  `INTERNAL` error, logged with its `correlationId`, instead of
  `BAD_USER_INPUT` (D-106).
- 60cc9cf: A live read whose client stops reading drops every message until the client
  drains, then sends its state once: a row or a value no longer goes past the
  full buffer, and a drain is waited for once (D-154). Over REST, a `where`
  key `__proto__` is refused as an unknown key instead of losing the filter,
  and `DELETE` answers the row without its virtuals, as GraphQL's
  `DeletedPost`, with a `DeletedPost` schema in the OpenAPI document (D-107).
- Updated dependencies [67d5152]
- Updated dependencies [9c6ca70]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4fba06b]
- Updated dependencies [4e1a966]
- Updated dependencies [6e7d759]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [9cebf63]
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
  - @ultimabase/http@0.4.0
  - @ultimabase/realtime@0.4.0

## 0.3.0

### Minor Changes

- 760560a: A query function can return a page of a model (D-182): its output is `Model.paginated()`, at the root or in a `defineType` field, and `run` returns `Model.paginate({ where, orderBy }, { as })`. GraphQL serves the model's connection with its page arguments, REST answers as the model's list route, with flat parameters at the root and one JSON parameter named by the field's path in a type; `totalCount` is counted only when asked. A page cannot be live.
- c39a148: `z.uuid()` is an `ID` in GraphQL, as a row's `id`, so a client passes a row's id to a function as `$id: ID!` (D-175). A client that declared `$id: String!` for such an argument declares `$id: ID!`.
- c5dcbb2: `graphqlPlugin({ generated })` writes the served schema as SDL to a file under `ultimabase dev`, when it changes, for a client's codegen (D-191).
- 6727285: A json schema with an id and `scalar: true`, `.meta({ id: 'RichText', scalar: true })`, is the GraphQL scalar `RichText`, read and written whole, in a json field or a function. Without an id, the scalar is named by its path, as `NoteSettings`. The id is also read from an `id` keyword, as Valibot and ArkType write it, which names a shared object type too.
- 2eb7b9d: `httpPlugin({ upgrade })` refuses WebSocket upgrades with a response, as
  during maintenance, and `closeUpgrades({ code, reason })` closes the sockets
  open: GraphQL's with that code, those of a plugin without `close` cut (D-166).
- a7588c3: `viewer: true` on a relation to the user model filters by the signed-in user, in server code, access rules, GraphQL and REST; `false` keeps the other rows, and a caller with no user matches no row with `true` (D-189).

### Patch Changes

- 8fdf30a: The error for a schema with no query tells an application without models, a plugin's own being never exposed, apart from one whose models all have `.with({ graphql: false })`.
- b75efa9: `maxDepth` counts no field of a connection or an edge, so `posts { edges { node { comments { edges { node { body } } } } } }` is 3 levels deep instead of 7; a relation or a virtual selected twice with different arguments, aliases and fragments included, is refused as the document is validated, naming both paths, before a query, a mutation or a subscription runs.
- 4cfa855: A live list's `first` is bounded by `maxLive` only, over GraphQL and REST; `maxTake` bounds page mode. A refusal past `maxLive` carries `details: { limit, rows }`, which `LiveError.details` exposes, and a `fetchMore` refused past it rejects while the list goes on following its window as it was (D-186).
- 3e2a684: A query or mutation sent over the GraphQL socket reads its caller again before it runs, as over HTTP; when it is another user, the socket closes with `4403`. `Viewer.identify()` reads a viewer's caller again (D-178).
- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [1195207]
- Updated dependencies [4cfa855]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [b06627c]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [3e2a684]
- Updated dependencies [353c2bf]
- Updated dependencies [2eb7b9d]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
  - ultimabase@0.3.0
  - @ultimabase/realtime@0.3.0
  - @ultimabase/http@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
- Updated dependencies [c0c5a21]
  - ultimabase@0.2.0
  - @ultimabase/realtime@0.2.0
  - @ultimabase/http@0.2.0

## 0.1.2

### Patch Changes

- @ultimabase/http@0.1.2
  - @ultimabase/realtime@0.1.2
  - ultimabase@0.1.2

## 0.1.1

### Patch Changes

- The published starter starts: `ultimabase dev` runs `dist/serve.js`, and `@ultimabase/realtime`, which `@ultimabase/graphql` and `@ultimabase/rest` import, is a required peer the starter lists.
- Updated dependencies
  - ultimabase@0.1.1
  - @ultimabase/http@0.1.1
  - @ultimabase/realtime@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - @ultimabase/http@0.1.0
  - @ultimabase/realtime@0.1.0
  - ultimabase@0.1.0
