# 419: Verify native Access against PostgreSQL

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 338, 418, 508
- ADR: ADR-0083, ADR-0087, ADR-0103, ADR-0116

## Goal

Prove native and plugin-contributed Access policies through the complete public
Runtime-to-PostgreSQL pipeline before implementing concrete permission plugins.

## Acceptance criteria

- [ ] A native schema policy and a fixture plugin policy compose through one Access plan.
- [ ] Read, first, get, count, exists, update, delete, upsert, model commands, and bulk terminals execute filters in SQL with developer predicates combined through `AND`.
- [ ] `beforeFind` cannot remove Access predicates and counts or cursor pages never include inaccessible rows.
- [ ] Item checks run on prepared singular targets inside the automatic mutation transaction and roll back nested writes on denial.
- [ ] Forbidden fields are absent from selected SQL columns and final models; explicit selection, filter, order, and mutation attempts fail before unsafe execution.
- [ ] Anonymous and audited-master behavior follows each contribution's declared policy.
- [ ] The E2E uses public package exports, Testcontainers, and one isolated PostgreSQL schema per worker.

## Tests

- [ ] Live PostgreSQL matrices cover native-only, plugin-only, combined, deny, filtered non-existence, field restrictions, item checks, rollback, and no-policy applications.
