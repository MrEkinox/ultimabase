# ADR-0058: Immutable unbound Query builder

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0005, ADR-0052, ADR-0055, ADR-0057
- Refined by: ADR-0108, ADR-0152, ADR-0155

## Decision

`@ultimabase/query` exposes `new Query(schema)` as an immutable, unbound class.
Every chain method returns a new frozen instance backed by an immutable Query
AST. A changed root reuses every unchanged AST branch so safe query branching
does not require deep cloning schemas or clauses.

Filter methods use Parse-inspired names and form an implicit `and`. Explicit
`and`, `or`, and `not` methods accept another Query and combine only its filter
expression. The receiving query retains its selection, ordering, limit, and
pagination. Logical queries must hold the exact same schema definition by
identity, preventing structurally similar schemas from being combined across
application boundaries.

Selection and ordering accumulate according to their established normalizer
rules. Limit remains independent from pagination. `skip` selects offset
pagination, `after` selects forward cursor pagination, and the two positions
cannot coexist on one Query branch.

The public methods correlate schema fields with legal operators and inferred
operand types. Runtime factories repeat field, capability, value, and inert
regex validation because JavaScript and transport inputs cannot rely on static
types. Mutable operands are snapshotted before entering the AST.

The unbound class exposes its schema and AST but no execution, persistence, or
engine binding behavior. A later Runtime-owned `BoundQuery` adds terminal
operations without making the Query package depend on Runtime.

## Consequences

Developers can define reusable base queries and branch them safely for offset
or cursor pagination. Transport normalization and direct TypeScript calls
produce the same immutable representation, while adapters remain responsible
only for compiling that representation.

Creating a changed branch allocates a new public Query shell and AST root, but
does not rebuild schema definitions or unchanged clause trees. Logical
composition intentionally rejects a different schema object even when its
shape is identical; applications must reuse their canonical schema definition.
