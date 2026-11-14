# create-ultimabase

## 0.8.0

### Patch Changes

- 8f82820: `ultimabase dev`, `sync`, `reset`, `migrate create` and `generate` also load the `.env.local` beside the config, whose values win over the `.env`'s; a variable already set still wins over both. The starter's `.gitignore` lists `.env.local`.

## 0.7.0

### Patch Changes

- 1f34e7a: The `cd` it prints is quoted for any character a shell would read otherwise, not only a space.

## 0.6.0

### Patch Changes

- 412f269: The starter's test writes its GraphQL document with `query`, as the documentation does.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.2

### Patch Changes

- 57b97c6: `npm create ultimabase` refuses the names npm refuses for a new package: one with a `~`, or starting with `-`; its message says a name starts with a letter or a digit.

## 0.1.1

### Patch Changes

- The published starter starts: `ultimabase dev` runs `dist/serve.js`, and `@ultimabase/realtime`, which `@ultimabase/graphql` and `@ultimabase/rest` import, is a required peer the starter lists.

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.
