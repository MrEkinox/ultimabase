# Packages

Every publishable workspace uses the `@ultimabase/*` scope and exposes only deliberate package exports.

## Foundations

- `shared`: dependency-light primitives.
- `core`: schema and query contracts, request authority, privilege and
  capability orchestration, protected CRUD Runtime, persistence plans, and
  transactions.

Core keeps those responsibilities in separate internal domains while exposing
one cohesive public package. This avoids cycles between inseparable contracts;
optional infrastructure and policy behavior remains in plugins.

The currently implemented native Hooks and Access domains remain in Core only
during the milestone 15 migration. Their accepted package destination is listed
below.

## Official plugins

- `roles-plugin`
- `acl-permissions-plugin`
- `acl-postgres-plugin`
- `pg-vector-plugin`
- `postgres-plugin`

## Planned plugin packages

The accepted names below remain issue-tracked but do not have workspace
directories until implementation begins:

- `postgres-migrations-plugin`
- `server-hono-plugin`
- `rest-plugin`
- `graphql-plugin`
- `graphql-yoga-plugin`
- `hooks-plugin`
- `access-plugin`

The optional engines use contract-only non-plugin packages that install no
behavior and are created with their first complete consumer issues:

- `hooks-contracts`
- `access-contracts`

Every plugin uses the `-plugin` suffix in both its workspace directory and its
published package name. This makes optional capabilities recognizable before a
developer reads their exports.

## Development tooling

- `typegen`: static application loading, deterministic compact schema
  declarations, plugin contributions, fingerprints, and atomic output
  replacement. It emits no generated Runtime client.
- `plugin-kit`: public immutable plugin-authoring helpers shared by official and
  community plugins without moving ownership or privilege enforcement out of Core.
- `testing`: application test utilities plus planned plugin conformance
  fixtures and assertions.

No package may import another package through its source directory.

Core does not import `plugin-kit`, `hooks-contracts`, or `access-contracts`.
Official and community engines import the appropriate contract package, while
only application configuration installs a `-plugin` implementation.

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
