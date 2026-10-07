# 520: Restore relation and role PostgreSQL E2E health

- Status: superseded
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`
- Depends on: 509, 510, 516, 518, 519
- ADR: none

The observed failure no longer reproduces after the accepted relationship,
Access, and item-oriented mutation refactors. This issue was not implemented
through its original diagnostic plan, so it is superseded rather than
retroactively marked done. On 2026-08-08, both the sequential and normally
concurrent PostgreSQL projects passed with 17 files and 67 tests.

## Goal

Identify and fix the database failures affecting the relation, role, and ACL
cleanup PostgreSQL scenarios without weakening Runtime error boundaries or test
isolation.

## Observed failure

`yarn vitest run --project postgres-e2e --maxWorkers=1` leaves five files red:

- `tests/e2e/relation-postgres.postgres.e2e.test.ts`
- `tests/e2e/acl-reference-cleanup-postgres.postgres.e2e.test.ts`
- `tests/e2e/acl-relationships-postgres.postgres.e2e.test.ts`
- `tests/e2e/acl-role-schema-postgres.postgres.e2e.test.ts`
- `tests/e2e/roles-postgres.postgres.e2e.test.ts`

The public failure is only `INTERNAL_ERROR: The database operation failed`, so
the underlying driver or schema cause must be captured through a trusted test
diagnostic boundary before choosing a fix. The ACL update-input resolution
scenario passes independently and must remain green.

## Acceptance criteria

- [ ] Capture enough trusted test-only evidence to identify each underlying PostgreSQL failure.
- [ ] Fix the proven root cause or split independent causes into narrower follow-up issues before implementation expands.
- [ ] Preserve one PostgreSQL schema per worker and the sanitized public database error contract.
- [ ] The five affected files pass independently and in the complete PostgreSQL project.
- [ ] Parallel execution remains isolated; a sequential-only workaround is not accepted.

## Tests

- [ ] `yarn vitest run --project postgres-e2e --maxWorkers=1` passes.
- [ ] `yarn vitest run --project postgres-e2e` passes with normal worker concurrency.
- [ ] Relevant adapter or compiler regression tests cover the identified root cause.

## Current verification

- [x] `yarn vitest run --project postgres-e2e --maxWorkers=1` passes: 17 files,
      67 tests.
- [x] `yarn vitest run --project postgres-e2e` passes with normal worker
      concurrency: 17 files, 67 tests.
- [x] Public database errors remain sanitized and PostgreSQL schemas remain
      isolated per worker.

## Out of scope

- Exposing raw SQL, driver messages, values, or credentials through public errors.
- Changing unified update-data ordering to hide an unrelated database failure.
