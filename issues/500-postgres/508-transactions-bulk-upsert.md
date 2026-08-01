# 508: Implement PostgreSQL transactions, bulk, and upsert

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 316, 317, 504, 507
- ADR: ADR-0015, ADR-0069, ADR-0089

## Goal

Provide atomic transactions, createMany, updateMany, deleteMany, and unique-target upserts.

## Acceptance criteria

- [ ] One adapter transaction binds every callback operation to one PostgreSQL client and commits or rolls back exactly once.
- [ ] The adapter rejects unsupported nested transactions consistently with Runtime's no-savepoint policy.
- [ ] Create-many and upsert-many preserve input order and return results in that order.
- [ ] Update-many and delete-many remain single set-based statements and return their documented summaries.
- [ ] Unique-target upserts compile without exposing Drizzle through the public adapter contract.
- [ ] A Runtime automatic mutation can reuse the adapter transaction so hook-started writes share the primary mutation's rollback boundary.
- [ ] Connection, statement, and commit failures release the client without reporting a false commit.
- [ ] The package README documents implemented transaction and bulk capabilities.

## Tests

- [ ] Commit, rollback, callback failure, commit failure, and client-release integration tests.
- [ ] Ordered bulk, set-based call-count, concurrency, and unique-conflict fixtures.
