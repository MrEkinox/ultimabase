# Packages

Every publishable workspace uses the `@ultimabase/*` scope and exposes only deliberate package exports.

## Foundations

- `shared`: dependency-light primitives.
- `core`: static schemas, immutable queries, request authority, application and
  plugin orchestration, CRUD Runtime, hooks, and transactions.

Core keeps those responsibilities in separate internal domains while exposing
one cohesive public package. This avoids cycles between inseparable contracts;
optional infrastructure and policy behavior remains in plugins.

## Official plugins

- `roles`
- `acl-permissions`
- `pg-vector-plugin`
- `postgres`
- `postgres-migrations`
- `server-hono`
- `rest`
- `graphql`
- `graphql-yoga`
- `testing`

No package may import another package through its source directory.

## Local development

Each package declares its own TypeScript, tsdown, and Vitest development dependencies. From a package workspace:

- `yarn build` builds only that package.
- `yarn test` runs only its source-local and package-level test files.
- `yarn typecheck` checks only its publishable source project.

Each `vitest.config.ts` is a minimal discovery entry point that reuses the shared configuration under `tooling/`.

Focused runtime and compile-time tests live beside the source they protect.
Package-level public-export and cross-domain tests remain under the package's
`tests/` directory.

From the repository root, `yarn test:pack` builds and validates every public archive with publint, Are The Types Wrong, an archive allowlist, and a Vitest Node consumer.
