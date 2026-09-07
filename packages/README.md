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

Hooks, Access, and application field validation live in their official vertical
packages. Core declares none of their product vocabulary, and community
alternatives use the same generic public kernel.

## Official plugins

- `roles-plugin`
- `acl-permissions-plugin`
- `pg-vector-plugin`
- `postgres-plugin`
- `hooks-plugin`
- `access-plugin`
- `validation-plugin`
- `http-plugin`
- `server-hono-plugin`
- `rest-plugin`
- `graphql-plugin`
- `password-auth-plugin`

## Planned plugin packages

The accepted names below remain issue-tracked but do not have workspace
directories until implementation begins:

- `postgres-migrations-plugin`
- `graphql-yoga-plugin`
- `http-basic-auth-plugin`
- `better-auth-plugin`

The optional Hooks and Access engines each keep their public authoring and
contribution contracts in their single official plugin package. The Validation
package owns only the direct `validation` field option and its
Standard Schema application behavior; Core keeps structural field validation.
Importing a package installs no behavior; application configuration does.
Independent alternative engines own their protocols and use the generic public
kernel.

Every plugin uses the `-plugin` suffix in both its workspace directory and its
published package name. This makes optional capabilities recognizable before a
developer reads their exports.

## Development tooling

- `typegen`: static application loading, deterministic compact schema
  declarations, plugin contributions, fingerprints, and atomic output
  replacement. It emits no generated Runtime client.
- `plugin-kit`: public immutable plugin-authoring helpers shared by official and
  community plugins without moving ownership or privilege enforcement out of Core.
- `testing`: application test utilities plus public plugin conformance fixtures
  and assertions.

No package may import another package through its source directory.

Core does not import `plugin-kit`, `hooks-plugin`, `access-plugin`, or
`validation-plugin`.
Official-compatible providers import their engine's public plugin contracts;
independent community engines own their contracts.

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
