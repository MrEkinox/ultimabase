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
- `postgres`
- `postgres-migrations`
- `server-hono`
- `rest`
- `graphql`
- `graphql-yoga`
- `testing`

No package may import another package through its source directory.
