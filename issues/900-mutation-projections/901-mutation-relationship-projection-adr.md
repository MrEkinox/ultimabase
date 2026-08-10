# 901: Decide mutation relationship projection semantics

- Status: done
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: none
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Define how create and update results reuse read `include` semantics without
creating a second public read lifecycle or changing item-oriented mutation hooks.

## Acceptance criteria

- [x] An accepted ADR defines singular and collection projection timing.
- [x] Root mutation Access and hooks execute exactly once per item.
- [x] Included target read Access and output restrictions remain monotonic.
- [x] Result reads use stable persisted identifiers inside the mutation transaction.
- [x] Collection results preserve input order even when database reads do not.
- [x] Mutations without `include` retain their current database path.
- [x] Delete and upsert mutation includes remain explicitly out of scope.

## Tests

- [x] The decision identifies the Runtime and adapter invariants later issues must prove.

## Out of scope

- Delete and upsert projections.
- Nested writes and relation mutation input.
- A developer-selectable relation loading strategy.
