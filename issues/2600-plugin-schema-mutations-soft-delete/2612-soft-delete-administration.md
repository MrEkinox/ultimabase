# 2612: Add Master-only restore and purge commands

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, database adapters
- Depends on: 2610, 2611
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Provide explicit server-side recovery and irreversible cleanup for tombstoned
items without creating a public transport administration surface.

## Acceptance criteria

- [x] Enabled schema handles expose exact typed `restore` and `purge` commands
      through the application-owned administrative surface accepted by ADR-0245.
- [x] Both commands require an authentic Core Master context. Trusted
      `useMasterKey` execution uses the existing mandatory elevation audit with
      the exact mutation and schema reason; an inherited Master context does not
      manufacture a second elevation event.
- [x] `restore` targets only a tombstoned row, atomically clears the tombstone,
      preserves ID, stored data, and relations, and returns the accepted restored
      result.
- [x] `purge` targets only a tombstoned row, performs an irreversible physical
      delete under every integrity constraint, and returns the accepted
      delete-shaped administrative result.
- [x] Anonymous, authenticated, forged, foreign-application, stale, and
      transport-derived contexts cannot reach either command or discover the
      hidden target.
- [x] REST and GraphQL planning deliberately receive no binding for restore or
      purge, even when the schema and explicit soft delete are public.
- [x] Failures, cancellation, Hook-started database work allowed by the accepted
      administrative lifecycle, and audit delivery retain transaction and
      post-commit ordering.
- [x] Optional before/after Hooks and generic Runtime observers receive enough
      attributed operation, target, request, and outcome data for durable
      operation-level auditing without a Core soft-delete audit sink.
- [x] Replace-delete and explicit schemas share the same administrative contract;
      disabled schemas expose neither command.

## Tests

- [x] Core, PostgreSQL, audit, authority, rollback, cancellation, relation,
      Typegen, JavaScript, two-instance, and application-isolation tests cover
      restore and purge.
- [x] REST route and GraphQL SDL removal assertions prove the commands are never
      generated endpoints.

## Out of scope

- Retention schedules, automatic purge, bulk administration, undelete tokens,
  or transport-accessible administration.

## Completion evidence

- The official plugin declares exact `ultimabase.soft-delete.restore` and
  `ultimabase.soft-delete.purge` definitions with Master authority. Effective
  explicit and replace-delete schemas receive schema-only commands; disabled
  schemas and persisted-model handles receive neither.
- The protected visibility contribution recognizes only the exact command,
  definition identity, version, and configured plugin instance for these two
  operations. It selects `isDeleted = true` without weakening any other row
  filter, while ordinary operations continue to select active rows only.
- PostgreSQL proves restore postimages, purge preimages and physical deletion,
  non-disclosing active or repeated targets, exact Master audit reasons,
  inherited Master execution without duplicate elevation, Hook attribution,
  Hook-started transactional work, rollback, cancellation, and preservation of
  pointer plus relation state through restore.
- The existing generic Core authority matrix retains forged, foreign,
  transport-derived, and stale-context rejection. Typegen and Typegen-free
  JavaScript snapshots prove exact schema/model surfaces and application-local
  ownership, while REST route and GraphQL SDL assertions prove that private
  administration receives no binding.
- Verified with focused plugin, Typegen, JavaScript, REST, GraphQL, and
  PostgreSQL suites, plus `yarn constraints`, `yarn check:issues`,
  `yarn format:check`, `yarn typecheck`, the full `yarn test`, `yarn lint`, and
  `NODE_OPTIONS=--max-old-space-size=8192 yarn build`. Lint reports only the
  existing centralized line-budget warnings.
