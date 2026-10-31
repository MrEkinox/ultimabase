# @ultimabase/realtime

## 0.3.0

### Minor Changes

- 760560a: A query function can return a page of a model (D-182): its output is `Model.paginated()`, at the root or in a `defineType` field, and `run` returns `Model.paginate({ where, orderBy }, { as })`. GraphQL serves the model's connection with its page arguments, REST answers as the model's list route, with flat parameters at the root and one JSON parameter named by the field's path in a type; `totalCount` is counted only when asked. A page cannot be live.
- 3e2a684: A query or mutation sent over the GraphQL socket reads its caller again before it runs, as over HTTP; when it is another user, the socket closes with `4403`. `Viewer.identify()` reads a viewer's caller again (D-178).

### Patch Changes

- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [aaf123c]
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
