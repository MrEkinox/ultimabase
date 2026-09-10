# 2612: Add Master-only restore and purge commands

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, database adapters
- Depends on: 2610, 2611
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Provide explicit server-side recovery and irreversible cleanup for tombstoned
items without creating a public transport administration surface.

## Acceptance criteria

- [ ] Enabled schema handles expose exact typed `restore` and `purge` commands
      through the application-owned administrative surface accepted by ADR-0245.
- [ ] Both commands require an authentic Core Master context. Trusted
      `useMasterKey` execution uses the existing mandatory elevation audit with
      the exact mutation and schema reason; an inherited Master context does not
      manufacture a second elevation event.
- [ ] `restore` targets only a tombstoned row, atomically clears the tombstone,
      preserves ID, stored data, and relations, and returns the accepted restored
      result.
- [ ] `purge` targets only a tombstoned row, performs an irreversible physical
      delete under every integrity constraint, and returns the accepted
      delete-shaped administrative result.
- [ ] Anonymous, authenticated, forged, foreign-application, stale, and
      transport-derived contexts cannot reach either command or discover the
      hidden target.
- [ ] REST and GraphQL planning deliberately receive no binding for restore or
      purge, even when the schema and explicit soft delete are public.
- [ ] Failures, cancellation, Hook-started database work allowed by the accepted
      administrative lifecycle, and audit delivery retain transaction and
      post-commit ordering.
- [ ] Optional before/after Hooks and generic Runtime observers receive enough
      attributed operation, target, request, and outcome data for durable
      operation-level auditing without a Core soft-delete audit sink.
- [ ] Replace-delete and explicit schemas share the same administrative contract;
      disabled schemas expose neither command.

## Tests

- [ ] Core, PostgreSQL, audit, authority, rollback, cancellation, relation,
      Typegen, JavaScript, two-instance, and application-isolation tests cover
      restore and purge.
- [ ] REST route and GraphQL SDL removal assertions prove the commands are never
      generated endpoints.

## Out of scope

- Retention schedules, automatic purge, bulk administration, undelete tokens,
  or transport-accessible administration.
