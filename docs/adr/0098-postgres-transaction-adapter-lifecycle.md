# ADR-0098: PostgreSQL transaction adapter lifecycle

- Status: accepted
- Date: 2026-08-02
- Extends: ADR-0015, ADR-0068, ADR-0085, ADR-0089
- Refined by: ADR-0100

## Decision

`@ultimabase/postgres` implements Runtime's adapter-neutral transaction contract
by borrowing one client from its private pool. `beginTransaction()` executes
`BEGIN` before exposing a `DatabaseTransactionAdapter`. That adapter creates a
private Drizzle client around the borrowed driver client and reuses the same
operation executor, schema catalog, codecs, and access-constraint boundary as
the application-scoped adapter.

Core, not Drizzle, owns the transaction callback lifetime. The PostgreSQL
plugin therefore uses explicit `BEGIN`, `COMMIT`, and `ROLLBACK` statements
instead of Drizzle's callback transaction API. The returned adapter deliberately
does not expose `beginTransaction()` or imply savepoint support.

A successful commit or rollback releases the borrowed client exactly once. A
failed commit keeps the adapter active because Runtime immediately attempts a
compensating rollback. A failed `BEGIN` or `ROLLBACK` destroys the client rather
than returning an uncertain transaction state to the pool. Concurrent or
repeated finalization fails locally without issuing another database statement.

Lifecycle failures map to sanitized `TRANSACTION_ERROR` values containing only
the phase and a stable driver code when one exists. Driver messages, SQL,
parameters, constraint diagnostics, connection values, and raw causes are not
retained. Serialization and deadlock failures are retryable only when the
outcome is not an ambiguous failed commit.

## Consequences

Explicit `RequestEngine.transaction()` now works with the official PostgreSQL
plugin for every operation the adapter already supports. The automatic mutation
boundary in issue 329 can depend on a real adapter lifecycle without breaking
the existing singular CRUD vertical.

Bulk statements and upserts remain issue 508. Isolation levels, savepoints, and
external systems remain outside the portable transaction contract.
