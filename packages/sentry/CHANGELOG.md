# @ultimabase/sentry

## 0.8.0

### Minor Changes

- 1520a09: `@ultimabase/sentry` reads the kernel's tracing channels into the Sentry client the application initialized: each model operation, hook, virtual field and function is a span of its request's trace, nested, and each error the server masks is an issue tagged with its correlation id. A `NOT_FOUND` or a refused input marks its span failed and makes no issue.

### Patch Changes

- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0
