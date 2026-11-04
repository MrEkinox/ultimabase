# @ultimabase/realtime

## 0.4.0

### Minor Changes

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

### Patch Changes

- 9c6ca70: A connection asking for its `totalCount` alone reads no row: over GraphQL
  when neither `edges` nor `pageInfo` is selected, or with `first: 0`; over
  REST and live with `first=0&totalCount=true` (D-226).
- 9b491fb: A live read plans its rows' read once per caller, its read rules and `beforeFind` included, instead of on every write it follows, opens with one query of the fields it needs, and keeps each row as its sort keys alone (D-195). A write followed by 10 000 subscribers on one list of 25 rows sends its last message in about 155 ms instead of 260; a subscription to 1000 rows holds 163 KiB instead of 305, and 10 000 of them open in 28.5 s instead of 54.
- 9b491fb: A lost right re-checks only the live reads it may reach (D-196). A delete in the feed tells the stored `one` keys of each deleted row, and a write through a read rule's relation is judged by that level's own conditions: with 10 000 subscribers, a deleted member row or a user leaving a role costs 4 statements instead of 10 000 to 20 000, and the engine is done in under 190 ms instead of 3.6 to 7.4 s. The subscriber who loses rows hears of it after about 150 to 190 ms instead of 65 to 75.
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

- 760560a: A query function can return a page of a model (D-182): its output is `Model.paginated()`, at the root or in a `defineType` field, and `run` returns `Model.paginate({ where, orderBy }, { as })`. GraphQL serves the model's connection with its page arguments, REST answers as the model's list route, with flat parameters at the root and one JSON parameter named by the field's path in a type; `totalCount` is counted only when asked. A page cannot be live.
- 1195207: A live row or list that selects a virtual field follows what its `run` or `runMany` read: a write to one of those rows sends again, with their new value, only the rows whose value changed (D-187).
- 4cfa855: A live list's `first` is bounded by `maxLive` only, over GraphQL and REST; `maxTake` bounds page mode. A refusal past `maxLive` carries `details: { limit, rows }`, which `LiveError.details` exposes, and a `fetchMore` refused past it rejects while the list goes on following its window as it was (D-186).
- 3e2a684: A query or mutation sent over the GraphQL socket reads its caller again before it runs, as over HTTP; when it is another user, the socket closes with `4403`. `Viewer.identify()` reads a viewer's caller again (D-178).

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

### Minor Changes

- c0c5a21: `viewer.onClose(listener)` runs once a viewer closes, whatever closes it: its caller ended, the application stopped or `close()` was called. A plugin's own socket closes there.

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
