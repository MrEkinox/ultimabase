# ADR-0069: Atomic bulk writes and unique upsert targets

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0004, ADR-0015, ADR-0059, ADR-0063, ADR-0068
- Refined by: ADR-0089, ADR-0099, ADR-0100, ADR-0108, ADR-0111, ADR-0112, ADR-0164

ADR-0164 replaces the public non-atomic and set-based collection mutation
contract in this record. Generated schema collection commands are now ordered,
atomic batches of singular item operations. The unique upsert-target decision
remains accepted.

## Decision

`BoundQuery` exposes `createMany`, `updateMany`, `deleteMany`,
`upsertOne`/`upsert`, and `upsertMany`. Bulk create and upsert preserve input
order in their returned object collections. Bulk update and delete return only
the affected-object count.

Create-many and upsert-many normalize `{ atomic: true }` by default. A root
`RequestEngine` executes these operations through its existing public
transaction lifecycle, rather than defining a second bulk-specific transaction
mechanism. `{ atomic: false }` explicitly executes on the root pipeline. An
atomic bulk operation inside an explicit transaction reuses that transaction
and does not trigger the nested-transaction error.

Every upsert target must consist exclusively of distinct, non-null equality
filters. Its exact field set must match the framework `id`, one schema field
declared with `indexed: 'unique'`, or one schema-level unique composite index.
Extra filters, partial composite keys, non-equality operators, ordering, limit,
and pagination are invalid upsert targets.

Normalization adds a `UniqueUpsertTargetNode` to each upsert operation or bulk
item. Its fields use schema index declaration order even when the developer
writes equality filters in another order. Database adapters therefore compile
an explicit conflict key and never need to repeat schema-aware inference.

Bulk upsert accepts one unbound `Query` per item. Selected fields are forbidden
there because the ordered bulk result always contains complete persisted
objects. Singular upsert retains the bound query selection and returns that
exact projected object shape.

## Consequences

The default protects multi-object imports from partial persistence and gives
post-commit hooks one real commit boundary. Developers can still choose
non-atomic adapter behavior explicitly for throughput or partial-success use
cases.

Database plugins receive deterministic ordered inputs, result contracts, and
unique targets. A database with different conflict syntax may implement it
without changing Query or Runtime semantics.

Unique upsert validity depends only on the static schema and Query AST. Concrete
database metadata, SQL syntax, and migration state remain outside
`@ultimabase/query`.
