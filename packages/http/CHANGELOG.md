# @ultimabase/http

## 0.3.0

### Minor Changes

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
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [aaf123c]
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
