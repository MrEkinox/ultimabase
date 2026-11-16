# @ultimabase/sentry

## 1.1.0

### Patch Changes

- Updated dependencies [44fd95d]
  - ultimabase@1.1.0

## 1.0.0

### Minor Changes

- 1520a09: `@ultimabase/sentry` reads the kernel's tracing channels into the Sentry client the application initialized: each model operation, hook, virtual field and function is a span of its request's trace, nested, and each error the server masks is an issue tagged with its correlation id. A `NOT_FOUND` or a refused input marks its span failed and makes no issue.

### Patch Changes

- 4b2278d: Outside a trace, such as in a job or a timer, a span the application starts inside a function, hook or query is sent again: the plugin no longer makes its own unsampled span the active one. Errors-only setups also stop cloning a Sentry scope for each operation and hook.
- 4b2278d: An error the plugin cannot read no longer ends the process: its span's `error.type` is `unknown`, and an error Sentry fails to capture is skipped.
- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [4b2278d]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [fd85be5]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [1520a09]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
  - ultimabase@1.0.0
