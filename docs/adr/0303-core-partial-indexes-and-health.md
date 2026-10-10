# ADR-0303: Partial indexes and application health in Core

- Status: accepted
- Date: 2026-10-09
- Refines: the schema `indexes` contract (`packages/core/src/schema/schema/indexes.ts`), ADR-0080
  (PostgreSQL index compilation), ADR-0297 (placement of `indexes`); applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/adaptateurs.md`, point 5, correcting PostgreSQL decisions 5 and
  10 and Soft Delete decision 7; `http.md` decision 5; `graphql.md` decision 2); record accepted by the user on 2026-10-09
- Evidence: `docs/handoff/audit-adaptateurs-base.md`, section 10 (`main` 116cf14e)

## Context

Schema-level indexes need at least two fields and have no predicate (`indexes.ts`). Soft Delete
needs a unique slug among non-deleted rows; the PostgreSQL review had put partial indexes in the
PostgreSQL options, a portable need inside one adapter's API. Likewise a PostgreSQL `ping()` export
for `/health` would make transports depend on one adapter.

## Decision

**Partial indexes.**

```ts
.with({
	indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
})
```

- `indexes` is declared in the final `.with` call, which sees the complete shape (developer,
  system and shape-method fields such as `isDeleted`).
- `fields` takes one or more fields; the two-field minimum is lifted. Field-level `indexed` stays
  the shorthand; an entry identical to a field-level index is a startup error.
- `where` is a static object in the `where` vocabulary limited to a portable subset: equality
  (shorthand or `eq`) and `gt`, `gte`, `lt`, `lte` on scalar non-list fields, null tests, and
  conjunction. `not`, `ne`, `OR`, `in`, string, list, JSON, relation and plugin operators are
  rejected by type and at declaration. Values are literals.
- The index covers only matching rows; with `unique`, uniqueness holds among matching rows and a
  violation is `UNIQUE_VIOLATION` (ADR-0302). Soft Delete never adds such an index automatically.
- Adapters declare a `partialIndexes` capability, checked at startup (ADR-0301). PostgreSQL
  compiles `CREATE [UNIQUE] INDEX … WHERE …`; synchronization replaces an index whose predicate
  changed.

**Health.** `ultimabase.health(): Promise<'OK' | 'DEGRADED'>`.

- `OK` when the application is started and the database adapter's required `checkHealth(signal)`
  capability succeeds within 2 seconds; `DEGRADED` otherwise (not started, stopping, failure,
  timeout). It never throws for an unhealthy database; the cause is logged server-side and never
  returned.
- The HTTP base route `/health` answers 200 `{ "status": "OK" }` or 503
  `{ "status": "DEGRADED" }` without application header or authentication; the GraphQL `health`
  field returns the same enum. Their options (path, `health: false`) belong to their migrations.
- PostgreSQL implements `checkHealth` with a trivial query on its pool; no `ping()` is exported.

## Consequences

- Soft Delete documentation shows the partial unique index; the PostgreSQL synchronization
  compares predicates through catalog introspection.
- Tests: declaration typing (allowed and rejected operators, plugin shape fields), startup
  capability refusal, uniqueness only among matching rows on PostgreSQL, predicate change;
  `health()` before start, after stop, on adapter failure and timeout; the HTTP route and
  GraphQL field never leak the cause.
- Documentation impact: both (indexes, Soft Delete, deployment and health guides).

## Out of scope

Readiness versus liveness probes, health contributions from other plugins (added when a real
plugin needs one), expression or ordered indexes, the MongoDB adapter.
