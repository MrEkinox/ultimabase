# 508: Implement PostgreSQL transactions, bulk, and upsert

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 316, 317, 504, 507
- ADR: ADR-0015

## Goal

Provide atomic transactions, createMany, updateMany, deleteMany, and unique-target upserts.

## Acceptance criteria

- [ ] Bulk create and upsert preserve input order.
- [ ] Rollback leaves no partial writes.
- [ ] Nested transaction behavior matches Runtime policy.

## Tests

- [ ] Concurrency, rollback, and unique-conflict fixtures.
