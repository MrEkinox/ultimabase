# 316: Implement bulk operations and upserts

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/query`
- Depends on: 308, 315, 317
- ADR: ADR-0004, ADR-0015, ADR-0069

## Goal

Add createMany, updateMany, deleteMany, upsertOne/upsert, and upsertMany.

## Acceptance criteria

- [x] Bulk create and upsert are atomic by default.
- [x] Upsert targets ID, unique field, or unique composite index.
- [x] Create/upsert return ordered objects; bulk update/delete return counts.

## Tests

- [x] Rollback and ordered-result contract tests.
