# @ultimabase/rest

## 0.3.0

### Minor Changes

- 760560a: A query function can return a page of a model (D-182): its output is `Model.paginated()`, at the root or in a `defineType` field, and `run` returns `Model.paginate({ where, orderBy }, { as })`. GraphQL serves the model's connection with its page arguments, REST answers as the model's list route, with flat parameters at the root and one JSON parameter named by the field's path in a type; `totalCount` is counted only when asked. A page cannot be live.

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
- Updated dependencies [3e2a684]
- Updated dependencies [353c2bf]
- Updated dependencies [2eb7b9d]
- Updated dependencies [aaf123c]
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
