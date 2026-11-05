# @ultimabase/maintenance

## 0.5.0

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0
  - @ultimabase/http@0.5.0

## 0.4.0

### Minor Changes

- 7accc26: Each plugin declares the codes its errors carry in its types' `errors`, and `ultimabase` exports `ErrorCodeOf<typeof app>`: the kernel's codes and those of each plugin the application lists, for a client to type its messages against (D-206). A GraphQL document the schema refuses, as an unknown field, now carries `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query.
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

- e52f4cc: A server no longer stays in maintenance when the read of an earlier switch
  answers after the read of a later one: a read or write that ends after a
  later one has no effect. A `GET` or any method but `PUT` on
  `/_ultimabase/maintenance` meets the 503 during the maintenance, as every
  other request. `retryAfter` must be a positive number of milliseconds: `NaN`,
  `0`, a negative number or `Infinity` refuses the start (D-222).
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
