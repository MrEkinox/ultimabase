# ADR-0085: Singular PostgreSQL CRUD execution

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0004, ADR-0007, ADR-0063, ADR-0067, ADR-0083, ADR-0084

## Decision

`@ultimabase/postgres` executes `find`, `first`, `get`, `count`, `exists`,
`create-one`, `update-one`, and `delete-one` through its private Drizzle client.
Every query operation reuses the shared filter and clause compilers. Explicit
selections become `RETURNING` projections for updates and deletes as well as
read projections.

Runtime remains the only owner of generated UUID v7 identifiers, defaults, and
automatic timestamps. The adapter encodes the normalized mutation it receives
and never regenerates those values. Reads and mutation results pass through the
same compiled field codecs. A physical `NULL` for an optional non-nullable
column restores property absence; an explicitly nullable field retains `null`.

`update-one` and `delete-one` select the deterministic first matching `id` in a
subquery and mutate that target in one SQL statement. This preserves filters,
ordering, offset, and cursor-first-page semantics without a read-then-write
race. `first`, `get`, `update-one`, and `delete-one` return `null` when no row
matches, as required by ADR-0067. Count applies the complete query position and
limit through a subquery rather than loading objects.

Driver data and integrity failures map to `VALIDATION_ERROR`; PostgreSQL's
explicit no-data code maps to `NOT_FOUND`; serialization and deadlock failures
map to retryable `INTERNAL_ERROR`; other failures map to non-retryable
`INTERNAL_ERROR`. Driver messages, SQL, parameters, and constraint names are
never public error details. Standard wrapped `cause` chains are inspected only
to recover the stable driver code, with bounded traversal and cycle detection.

Until access compilers exist, any non-empty portable access-constraint list
fails closed. Bulk operations, upserts, transactions, and authenticated cursor
token wiring remain separate capabilities and cannot silently fall back to
singular or offset behavior.

## Consequences

The assembled Runtime can now persist and retrieve singular objects without
exposing Drizzle or writing SQL. Equal-match mutations remain deterministic and
atomic at the statement level. The Testcontainers worker harness and complete
public Runtime-to-PostgreSQL scenario remain the next two issues, so mocked
driver conformance is not presented as live database proof.
