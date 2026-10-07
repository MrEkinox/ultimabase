# 519: Implement the PostgreSQL transaction adapter lifecycle

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 317, 504, 507
- ADR: ADR-0068, ADR-0098

## Goal

Bind each Runtime transaction to one borrowed PostgreSQL client before Core
makes transactions mandatory for every mutation.

## Acceptance criteria

- [x] `beginTransaction()` borrows one pool client and starts `BEGIN` before returning a transaction adapter.
- [x] Transaction operations reuse the same Drizzle compiler, schema catalog, and borrowed client.
- [x] A successful commit or rollback releases the client exactly once.
- [x] Begin and rollback failures destroy clients whose transaction state may be unsafe to reuse.
- [x] A failed commit leaves the adapter available for Runtime's compensating rollback.
- [x] Concurrent or repeated finalization cannot issue duplicate statements or releases.
- [x] Driver messages, SQL, values, and credentials never enter transaction framework errors.
- [x] Bulk execution, upserts, savepoints, and isolation-level configuration remain outside this issue.

## Tests

- [x] Unit tests cover commit, rollback, begin failure, commit failure, rollback failure, closed adapters, and concurrent finalization.
- [x] A live PostgreSQL test proves explicit Runtime commit and rollback behavior.
