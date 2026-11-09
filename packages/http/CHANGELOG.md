# @ultimabase/http

## 0.6.0

### Minor Changes

- 2f1baf1: A database the server cannot use answers `UNAVAILABLE`, not `INTERNAL` (D-335): every pool connection stayed busy, or the server cannot be reached. REST answers it with 503 and `Retry-After: 1`. GraphQL, as for every error, answers HTTP 200 with the code in `errors[].extensions.code` and `extensions.details.retryAfter`: a client that retries from the HTTP status reads the code instead. The reason is logged at `error`. `UNAVAILABLE` is now a kernel code.

### Patch Changes

- a47bbc4: A storm of connections no longer fails. The server's connection queue holds 4096, and at most 8 connections open at once. A socket closed by a failure of the server now gets `1013`, which `graphql-ws` retries, where it got `4403`: `4403` now means refused, and only that. `liveFetch` reconnects at a random moment of its wait, so that clients cut together do not come back together.
- 3d7f654: A request costs up to 18 % less CPU: the server keeps its light response through CORS, the body limit and its headers. `Access-Control-Allow-Credentials` goes out only with an allowed origin, and a route's own `Vary` is kept.
- dfa430e: On Linux, a server takes connections 16 times faster when it is busy: with 2000 clients, the slowest
  one waits about 2.5 s instead of about 18 s, and a health probe under 1 s instead of over 5 s.
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

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0

## 0.4.0

### Minor Changes

- 7accc26: Each plugin declares the codes its errors carry in its types' `errors`, and `ultimabase` exports `ErrorCodeOf<typeof app>`: the kernel's codes and those of each plugin the application lists, for a client to type its messages against (D-206). A GraphQL document the schema refuses, as an unknown field, now carries `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query.
- 4e1a966: `httpPlugin` answers `GET /health` and `GET /ready`, before every route.
  `/ready` answers 503 until every plugin started, once the stop began, and
  while a check a plugin added with `plugins.http.ready(check)` fails. On
  `stop`, the server keeps serving for `drain` milliseconds, 5000 in
  production, before the plugins stop. Plugins get two hooks: `started`, once
  every plugin started, and `stopping`, before any plugin stops (D-204).
  Until every plugin started, every other request and upgrade answers 503
  `UNAVAILABLE`, Master's too (D-207).
- e4c1252: `httpPlugin()` limits each client address to 600 requests and upgrades a
  minute, answering 429 `TOO_MANY_ATTEMPTS` with `Retry-After` past it, before
  any session is read (D-218). `rateLimit: { requests, window }` changes the
  limit and `rateLimit: false` turns it off. An IPv6 address counts by its /64;
  a local or private address is never counted; the master key passes.
- 9cebf63: New package, `@ultimabase/maintenance`: `maintenancePlugin()` answers 503
  `MAINTENANCE`, with `Retry-After`, to every request and WebSocket upgrade
  but Master's, and closes the open sockets with 1012, while the maintenance
  is on. `PUT /_ultimabase/maintenance { enabled }`, with the master key or
  the `key` option sent in `x-ultimabase-maintenance-key`, turns it on and
  off, and so do `plugins.maintenance.lock()` and `unlock()`; every server
  follows the stored state, or `initial` while none is stored, and a start
  that cannot read it fails (D-207). `/health` and `/ready` are left
  alone. Plugins add their own gates with `plugins.http.gate(gate)`, run on
  each request past CORS and on each upgrade (D-205).

### Patch Changes

- 9c6ca70: A connection asking for its `totalCount` alone reads no row: over GraphQL
  when neither `edges` nor `pageInfo` is selected, or with `first: 0`; over
  REST and live with `first=0&totalCount=true` (D-226).
- 4fba06b: Each operation sent over a GraphQL WebSocket counts as a request of its
  address: over the limit it fails with `TOO_MANY_ATTEMPTS` and
  `details.retryAfter`, and the socket stays open. `Upgrade` gains `limit()`,
  which counts one more request for a plugin's own socket (D-230). A live
  function's subscription is refused past `maxRows`, as its query over HTTP
  (D-229). A value graphql-js cannot send, as an `Int` above 2³¹, is an
  `INTERNAL` error, logged with its `correlationId`, instead of
  `BAD_USER_INPUT` (D-106).
- 6e7d759: A WebSocket or a form from the server's own host over HTTPS, as a proxy
  serving HTTPS forwards it, is the server's own origin, not refused unless
  `cors` lists it. The start refuses a `bodyLimit` that is not a whole number
  of bytes above 0, as `NaN`, which lifted the limit, and a `drain` that is
  not a whole number of milliseconds.
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
- 2eb7b9d: `httpPlugin({ upgrade })` refuses WebSocket upgrades with a response, as
  during maintenance, and `closeUpgrades({ code, reason })` closes the sockets
  open: GraphQL's with that code, those of a plugin without `close` cut (D-166).

### Patch Changes

- 8ce42f6: `transaction(run, { isolation: 'serializable' })` runs a serializable transaction, and runs `run` again when the database aborts it for a conflict with another, after a random wait that grows with each attempt, 10 attempts at most (D-183); the tenth conflict fails with the new code `CONFLICT`, status 409 over HTTP (D-179). An adapter's `begin` takes `{ isolation: 'serializable' }`, throws when it cannot hold it, and reports a conflict as `Conflict`: PostgreSQL reports `40001` and `40P01`. `testAdapter` checks that two serializable transactions reading what the other writes never both commit.
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
