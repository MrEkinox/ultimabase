# Milestone 67: Core path simplification canaries

- Status: completed
- Goal: remove proven internal detours and repeated contracts without changing capabilities or public DX.

## Execution order

- [x] [6701: Test the four Core audit candidates](6701-core-canaries.md)

## Boundary

The user approved all four trials on 2026-10-02: direct mutation normalization,
single schema validation before atomic publication, shared enum factory typing,
and shared field/filter compatibility facts. Reuse existing concepts; retain
Typegen boundaries, protected identities, transaction ordering and editor checks.
Reject a trial if preserving parity adds more complexity. No push authorized.
