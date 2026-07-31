# ADR-0068: RequestEngine transaction lifetime

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0015, ADR-0063, ADR-0064, ADR-0065

## Decision

`RequestEngine.transaction(callback)` derives its transaction from the root
`DatabaseAdapter` already attached to the Runtime pipeline. The temporary
application-supplied transaction runner is removed. Runtime begins one adapter
transaction and creates a distinct callback-scoped `RequestEngine` that retains
the exact `FrameworkEngine` and `RequestContext` identities.

Runtime also installs that transaction engine as the nested native asynchronous
scope for the callback. `getCurrentEngine()` therefore cannot return the root
engine and accidentally bypass the active transaction. The previous request
scope is restored when the transaction callback finishes.

The transaction pipeline reuses every normalization, validation, access, and
hook stage while replacing only the database executor. Per-operation commit is
suppressed because the outer adapter transaction commits exactly once. Ordered
post-commit effects are buffered and run only after that adapter commit
succeeds. Rollback discards the buffer.

The transaction engine is active only while its callback is running. Runtime
tracks every operation started during that lifetime, including an operation the
callback did not await, and waits for it before finalization. Its first
operation failure makes the transaction rollback-only even when developer code
catches the rejection. Queries or engines retained beyond the callback fail
with `TRANSACTION_ERROR`.

Nested `RequestEngine.transaction()` calls are rejected with
`TRANSACTION_ERROR`. UltimaBase does not silently reuse the outer transaction
or imply savepoint support that an adapter may not provide. A later savepoint
contract may introduce an explicit nesting option.

Callback and operation failures trigger rollback and retain their original
error identity when cleanup succeeds. Commit failure also attempts rollback.
When rollback independently fails, Runtime reports both failures through
`AggregateError`. A post-commit effect failure is reported after commit and
cannot roll back already committed data.

## Consequences

Authentication, capabilities, metadata, permission stages, and hooks remain
identical inside and outside a transaction. Database plugins implement only the
existing adapter-neutral begin, execute, commit, and rollback contracts.

Transaction engines cannot become accidental long-lived request engines. Bulk
operations and upserts can now depend on one deterministic atomic boundary,
while future post-commit event implementations receive correct outer-commit
timing.
