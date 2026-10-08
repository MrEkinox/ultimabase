# ADR-0292: Default the PostgreSQL schema policy from the environment

- Status: accepted
- Date: 2026-10-08
- Refines: the `schemaPolicy` default of `@ultimabase/postgres-plugin`; applies ADR-0288
- Approval: user validated on 2026-10-08
- Implementation: done on 2026-10-08 (`@ultimabase/postgres-plugin`)

## Context

`postgresPlugin()` defaults `schemaPolicy` to `override`
(`packages/postgres-plugin/src/plugin/postgres-plugin.ts`), which makes the
database match the registered schemas on every start, destructive changes
included. A production application that omits the option therefore runs
schema-altering statements silently at startup. No migration plugin exists yet.

## Decision

When the developer omits `schemaPolicy`, the PostgreSQL plugin reads
`NODE_ENV` in its factory: `production` selects `fail` (refuse to start when the
database differs from the schemas), any other value or an absent variable
selects `override`. An explicit `schemaPolicy` always wins. Core never reads the
environment; the choice belongs to the plugin factory. The startup error for
`fail` names the drifting tables and columns.

## Consequences

Development keeps automatic synchronization. A production deployment must
apply schema changes deliberately (manually today, through the planned
migration plugin later) or opt into `override` explicitly. Documentation and
`create-app` templates explain both modes.

## Proof

`yarn validate:full` passed on 2026-10-08. The DX audit against `origin/main`
(`node tooling/dx-audit/run.mjs`) reports only the new `schemaPolicy`
documentation and `@default` tag in hovers.
