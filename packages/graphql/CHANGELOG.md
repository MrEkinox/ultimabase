# @ultimabase/graphql

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
