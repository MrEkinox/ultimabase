# 508: Implement PostgreSQL bulk and upsert execution

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 316, 317, 504, 507, 519
- ADR: ADR-0015, ADR-0069, ADR-0089

## Goal

Provide createMany, updateMany, deleteMany, and unique-target upserts on top of
the transaction lifecycle implemented by issue 519.

## Acceptance criteria

- [ ] Create-many and upsert-many preserve input order and return results in that order.
- [ ] Update-many and delete-many remain single set-based statements and return their documented summaries.
- [ ] Unique-target upserts compile without exposing Drizzle through the public adapter contract.
- [ ] A Runtime automatic mutation can reuse the adapter transaction so hook-started writes share the primary mutation's rollback boundary.
- [ ] The package README documents implemented bulk and upsert capabilities.

## Tests

- [ ] Ordered bulk, set-based call-count, concurrency, and unique-conflict fixtures.
