# Milestone 67: Core path simplification canaries

- Status: completed
- Goal: remove proven internal detours and repeated contracts without changing capabilities or public DX.

## Execution order

- [x] [6701: Test the four Core audit candidates](6701-core-canaries.md)
- [x] [6702: Simplify model commands, inclusions and result materialization](6702-model-inclusion-result-canaries.md)
- [x] [6703: Simplify relation construction, ordering and field traversal](6703-relation-ordering-traversal-canaries.md)

## Boundary

The user approved all four trials on 2026-10-02: direct mutation normalization,
single schema validation before atomic publication, shared enum factory typing,
and shared field/filter compatibility facts. Reuse existing concepts; retain
Typegen boundaries, protected identities, transaction ordering and editor checks.
Reject a trial if preserving parity adds more complexity. No push authorized.

The user approved the follow-up model-command, inclusion and result trials on
2026-10-02. They retain the same boundaries and validation gate.

The user also approved the relation, nested-write index, ordering and update
field traversal trials on 2026-10-02, with the same preservation constraints.
