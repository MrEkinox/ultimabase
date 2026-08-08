# ADR-0162: Distinguish strict object targets from nullable where mutations

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0085, ADR-0100, ADR-0101, ADR-0115, ADR-0151, ADR-0152, ADR-0161

## Context

Singular reads and mutations previously shared nullable result semantics even
when the caller already owned one exact object identity. That made a missing
`get(id)` or persisted-model command indistinguishable from an exploratory
`where` mutation that happened not to match a row.

Schema mutation lifecycle hooks also require one real item pair. Calling
`beforeUpdate`, `afterUpdate`, `beforeDelete`, or `afterDelete` with manufactured
null values would make their non-null item contracts misleading.

## Decision

Object-targeted commands are strict:

- schema `get({ id })` throws `NOT_FOUND` when no row matches;
- persisted-model `fetch`, `update`, and `delete` throw `NOT_FOUND` when their
  protected identity is missing or inaccessible;
- protected access denial remains indistinguishable from absence so retained
  identities cannot be used as an existence oracle.

Exploratory schema mutations remain nullable:

- `updateOne({ where, data })` and `deleteOne({ where })` return `null` when the
  unique `where` target matches no visible row;
- that empty outcome does not run the matching schema item lifecycle hooks;
- input resolution, structural validation, Access enforcement, and transaction
  finalization remain operation boundaries rather than evidence that an item
  existed.

Adapters prepare singular mutations inside their transaction and expose either
one stable complete target or `null`. PostgreSQL locks a matched target with
`FOR UPDATE` before item lifecycle hooks and reuses its identifier for the final
statement, preventing a concurrent disappearance between those boundaries.

## Consequences

- `get` and persisted-model commands have non-null TypeScript result types.
- Developers use `findOne` when absence is expected as ordinary control flow.
- Where-based update and delete preserve convenient conditional-mutation
  semantics without manufacturing hook item values.
- Strict instance commands retain their protected-target security behavior.
- Adapter contracts may still return `null` for a physical `get`; Runtime maps
  that storage outcome to the public `NOT_FOUND` contract before result hooks.
