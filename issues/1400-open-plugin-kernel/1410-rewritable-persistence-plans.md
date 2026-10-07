# 1410: Separate logical operations from rewritable persistence plans

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 1409
- ADR: ADR-0188, ADR-0191, ADR-0193, ADR-0200

## Goal

Compile one immutable adapter persistence plan from a preserved logical
operation and let an authorized plugin rewrite only that physical plan.

## Acceptance criteria

- [x] Runtime retains one immutable logical operation for validation, Access, hooks, diagnostics, audit, public result typing, and transaction policy.
- [x] Adapter execution consumes a separate immutable persistence plan with exact target, data, returning, constraint, and provenance contracts.
- [x] `persistence:rewrite` can replace the physical plan without starting a nested public operation or receiving `runtime:replace` or master authority.
- [x] Protected row filters and constraints accumulated for the logical target apply to the actual rewritten database statement.
- [x] A soft-delete fixture observes delete semantics while PostgreSQL performs one tombstone update inside the original transaction.
- [x] Itemized `deleteMany` rewrites each singular plan in order and rolls back the complete batch on failure.
- [x] Missing adapter support, incompatible plan versions, changed result shapes, and illegal cross-schema rewrites fail before or inside the protected execution boundary with owner diagnostics.

## Tests

- [x] Focused Runtime and PostgreSQL tests cover delete-to-update, constraints, hooks, rollback, collection order, result materialization, relations, and master behavior.
- [x] Type tests preserve logical operation/result correlation across rewritten plans without assertions leaking publicly.

## Out of scope

- A production soft-delete package; the milestone uses a conformance fixture.
- Automatic destructive migration or unique-index policy.

## Validation

- `yarn typecheck`
- `yarn test` — 325 files and 1,960 tests passed.
- `yarn lint` — passed with only the repository's tracked size warnings.
- `yarn constraints`
- `yarn build` — package builds, `attw`, and `publint` passed.
- `yarn test:pack:built` — 9 files and 52 tests passed.
- `vitest run --project e2e --passWithNoTests` — 12 files and 60 tests passed.
- `vitest run --project postgres-e2e --passWithNoTests` — 19 files and 71 tests
  passed through Docker/Testcontainers outside the filesystem sandbox.
