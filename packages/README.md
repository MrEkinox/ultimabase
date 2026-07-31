# Packages

Every publishable workspace uses the `@ultimabase/*` scope and exposes only deliberate package exports.

## Foundations

- `shared`: dependency-light primitives.
- `schema`: static schema and field definitions.
- `query`: operation/query AST and immutable query classes.
- `access`: shared access-rule contracts without policy implementations.
- `core`: application, plugins, services, lifecycle, and errors.
- `runtime`: CRUD orchestration, contexts, hooks, and transactions.

## Official plugins

- `roles`
- `clp-permissions`
- `acl-permissions`
- `field-permissions`
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
