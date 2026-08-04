# ADR-0121: Explicit plugin package names

- Status: accepted
- Date: 2026-08-04

## Context

UltimaBase publishes foundational libraries, developer tooling, and optional
plugins under the same `@ultimabase/*` scope. Names such as
`@ultimabase/postgres` or `@ultimabase/roles` did not reveal whether installing
the package contributed a plugin or only exported reusable contracts.

## Decision

Every publishable package whose primary capability is installed through an
UltimaBase plugin must end with `-plugin` in both places:

- its workspace directory, `packages/<capability>-plugin`;
- its published name, `@ultimabase/<capability>-plugin`.

Foundational and tooling packages such as `@ultimabase/core`,
`@ultimabase/shared`, and `@ultimabase/testing` do not use the suffix. Exported
factory names remain concise, such as `postgresPlugin()` and `rolesPlugin()`.

The current plugin packages are renamed as follows:

- `@ultimabase/roles` to `@ultimabase/roles-plugin`;
- `@ultimabase/acl-permissions` to `@ultimabase/acl-permissions-plugin`;
- `@ultimabase/postgres` to `@ultimabase/postgres-plugin`;
- `@ultimabase/postgres-migrations` to `@ultimabase/postgres-migrations-plugin`;
- `@ultimabase/server-hono` to `@ultimabase/server-hono-plugin`;
- `@ultimabase/rest` to `@ultimabase/rest-plugin`;
- `@ultimabase/graphql` to `@ultimabase/graphql-plugin`;
- `@ultimabase/graphql-yoga` to `@ultimabase/graphql-yoga-plugin`.

`@ultimabase/pg-vector-plugin` already follows the convention. Planned plugin
packages must use the suffix from their first issue and implementation.

## Consequences

Developers can identify optional installation units directly from imports,
package manifests, and repository paths. Package moves remain visible as
breaking pre-release renames, while Core and support libraries keep concise
names. New plugin proposals have one mechanically reviewable naming rule.
