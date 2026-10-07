# 1001: Add singular identifier target aliases

- Status: completed
- Milestone: 10
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: [ADR-0182](../../docs/adr/0182-singular-id-target-aliases.md)

## Goal

Allow `updateOne` and `deleteOne` to accept a top-level schema-aware `id` while
normalizing it immediately into their existing canonical unique `where` input.

## Acceptance criteria

- [x] Both commands accept exactly one of `id` or `where`.
- [x] `id` reuses the same `OperationObjectId` contract as `get`.
- [x] Existing `where` calls remain source-compatible.
- [x] Runtime validation rejects inputs containing both targets or neither target.
- [x] The alias normalizes to `{ id: { eq: id } }` before Query or Operation AST construction.
- [x] Access, hooks, transactions, adapters, return projections, and null-on-missing behavior remain unchanged.
- [x] No new AST node, Runtime branch, or database capability is introduced.

## Tests

- [x] Compile-time tests prove both valid forms and reject both invalid combinations.
- [x] Runtime tests prove equivalent canonical operations for `id` and `where`.
- [x] Existing singular mutation tests remain green.

## Out of scope

- `findOne`, `get`, and `upsertOne` input changes.
- Instance command changes.
- `updateMany` and `deleteMany` item aliases.
- Transport-specific mutation syntax.
