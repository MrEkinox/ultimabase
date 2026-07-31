# ADR-0063: Portable database adapter boundary

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0007, ADR-0059

## Decision

`@ultimabase/runtime` defines one transport-neutral `DatabaseAdapter` contract.
It receives a normalized Operation AST together with an explicit readonly list
of portable access-constraint nodes. The contract does not expose SQL, Drizzle,
database connections, transport requests, or `RequestContext` authority.

The generic execution method preserves the exact schema-specific operation at
the call site. Result types are derived from the operation discriminant: object
reads and single-object writes return selected partial records, bulk object
creation and upsert return ordered record collections, count and bulk mutation
operations return numbers, and existence checks return booleans. Runtime owns
validation before these values reach developer code.

Transactions use a separate `DatabaseTransactionAdapter` discriminant. A root
adapter may begin a transaction; the returned adapter may execute operations,
commit, or roll back. It deliberately cannot begin a nested transaction until
Runtime defines an explicit nesting policy.

Access plugins may extend `DatabaseAccessConstraintNode` with portable data.
Concrete database plugins compile those nodes together with the Operation AST;
permission plugins must never leak database-specific syntax across this
boundary.

## Consequences

PostgreSQL and future database plugins can implement the same Runtime contract
without making Core or Runtime depend on their query builders. Every operation
must carry an explicit access-constraint list, including an empty list after an
access decision, so adapters do not accidentally execute an undecided request.

Transaction executors are identifiable and cannot be confused with root
adapters. Nested transactions, savepoints, streaming results, and adapter-
specific extensions require later explicit contracts rather than accidental
implementation leakage.
