# ADR-0298: Withhold the pg-vector plugin from create-app

- Status: accepted
- Date: 2026-10-09
- Refines: the plugin catalog of `@ultimabase/create-app`; applies ADR-0288
- Approval: user decided on 2026-10-09 during the pg-vector plugin review

## Context

`@ultimabase/pg-vector-plugin` contributes `field.vector()` but cannot be used
in a persisted application: the PostgreSQL plugin has no compiler for its
field kind and refuses to start, REST has no codec for it, and no similarity
query exists. `create-app` nevertheless offered it.

## Decision

`create-app` stops offering pg-vector until the plugin ships storage. The
package stays in the repository. `officialPlugins` and the `PluginId` union no
longer contain it; the `--plugin pg-vector-plugin` flag and programmatic
selection fail with the reason (`it does not persist vector fields`).

## Consequences

The public `officialPlugins` tuple shrinks from 16 to 15 entries; the DX audit
against `main` reports only that change (declaration, hovers, tuple length and
indexes). The plugin will be completed after the Core migration, likely split
into a neutral `vector` plugin and per-adapter implementations
(`docs/handoff/revue-plugins/pg-vector.md`, `adaptateurs.md`).
