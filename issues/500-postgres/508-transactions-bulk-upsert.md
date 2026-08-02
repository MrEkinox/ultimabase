# 508: Implement PostgreSQL bulk and upsert execution

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 316, 317, 344, 504, 507, 519
- ADR: ADR-0015, ADR-0069, ADR-0089, ADR-0100

## Goal

Provide createMany, updateMany, deleteMany, and unique-target upserts on top of
the transaction lifecycle implemented by issue 519.

## Acceptance criteria

- [ ] Create-many and upsert-many preserve input order and return results in that order.
- [ ] Update-many and delete-many remain single set-based statements and return their documented summaries.
- [ ] Unique-target upserts compile without exposing Drizzle through the public adapter contract.
- [ ] Bulk and upsert execution consumes the prepared-mutation protocol and returns ordered internal outcomes with the database-resolved branch for each upsert item.
- [ ] `beforeUpsert` receives immutable create and update candidates, while after and change hooks receive only the branch PostgreSQL actually executed.
- [ ] Bulk and upsert statements execute through the transaction adapter selected by Runtime without opening a side transaction.
- [ ] The package README documents implemented bulk and upsert capabilities.

## Tests

- [ ] Ordered bulk, set-based call-count, concurrency, and unique-conflict fixtures.
