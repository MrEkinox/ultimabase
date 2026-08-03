# 419: Verify native Access against PostgreSQL

- Status: done
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 338, 418, 508
- ADR: ADR-0083, ADR-0087, ADR-0103, ADR-0116

## Goal

Prove native and plugin-contributed Access policies through the complete public
Runtime-to-PostgreSQL pipeline before implementing concrete permission plugins.

## Acceptance criteria

- [x] A native schema policy and a fixture plugin policy compose through one Access plan.
- [x] Shared and grouped schema read rules cover `one`, `many`, `count`, and `exists`, while grouped field read rules cover item output, filtering, and ordering through public declarations.
- [x] Read, first, get, count, exists, update, delete, upsert, model commands, and bulk terminals execute filters in SQL with developer predicates combined through `AND`.
- [x] `beforeFind` cannot remove Access predicates and counts never include inaccessible rows; cursor compilation shares the same combined SQL predicate.
- [x] Item checks run on prepared singular targets inside the automatic mutation transaction and roll back nested writes on denial.
- [x] Forbidden fields are absent from selected SQL columns and final models; explicit selection, filter, order, and mutation attempts fail before unsafe execution.
- [x] Anonymous and audited-master behavior follows each contribution's declared policy.
- [x] The E2E uses public package exports, Testcontainers, and one isolated PostgreSQL schema per worker.

## Tests

- [x] Live PostgreSQL matrices cover native-only, plugin-only, combined, deny, filtered non-existence, field restrictions, item checks, rollback, and existing no-policy applications.
