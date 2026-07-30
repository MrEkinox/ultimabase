# 316: Implement bulk operations and upserts

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/query`
- Depends on: 308, 315, 317
- ADR: ADR-0004, ADR-0015

## Goal

Add createMany, updateMany, deleteMany, upsertOne/upsert, and upsertMany.

## Acceptance criteria

- [ ] Bulk create and upsert are atomic by default.
- [ ] Upsert targets ID, unique field, or unique composite index.
- [ ] Create/upsert return ordered objects; bulk update/delete return counts.

## Tests

- [ ] Rollback and ordered-result contract tests.
