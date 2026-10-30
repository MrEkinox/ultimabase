# ultimabase

## 0.2.0

### Minor Changes

- 2c3bf4e: A `one` relation read through `include` or `select` is typed `Target | null`, required relations included: it reads `null` when a read rule hides its target or the target is soft-deleted, which the type did not say. Code that reads such a relation now handles `null`, as in `message.author?.name`.
- fd1263e: A plugin's context gives `dependents`, the plugins that require it, and auth warns at start when no sign-in method requires it (D-164).

## 0.1.2

No changes in this release.

## 0.1.1

### Patch Changes

- The published starter starts: `ultimabase dev` runs `dist/serve.js`, and `@ultimabase/realtime`, which `@ultimabase/graphql` and `@ultimabase/rest` import, is a required peer the starter lists.

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.
