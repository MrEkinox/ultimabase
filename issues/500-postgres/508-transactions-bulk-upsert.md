# 508: Implement PostgreSQL bulk and upsert execution

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 316, 317, 334, 344, 504, 507, 519
- ADR: ADR-0015, ADR-0069, ADR-0089, ADR-0100, ADR-0111, ADR-0112

## Goal

Provide createMany, updateMany, deleteMany, and unique-target upserts on top of
the transaction lifecycle implemented by issue 519.

## Acceptance criteria

- [x] Create-many and upsert-many preserve input order and return results in that order.
- [x] Non-atomic create and upsert use item-local recovery, stop at the first persistence failure, and return the ADR-0111 stopped-prefix result without invalidating the outer transaction.
- [x] Update-many and delete-many remain single set-based statements and return their documented summaries.
- [x] Unique-target upserts compile without exposing Drizzle through the public adapter contract.
- [x] Bulk and upsert execution consumes the prepared-mutation protocol and returns ordered internal outcomes with the database-resolved branch for each upsert item.
- [x] `beforeUpsert` receives immutable create and update candidates, while after and change hooks receive only the branch PostgreSQL actually executed.
- [x] Bulk and upsert statements execute through the transaction adapter selected by Runtime without opening a side transaction.
- [x] The package README documents implemented bulk and upsert capabilities.

## Tests

- [x] Ordered atomic and stopped-prefix bulk, set-based call-count, savepoint recovery, concurrency, and unique-conflict fixtures.
