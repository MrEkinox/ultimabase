# 101: Add foundational shared primitives

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/shared`
- Depends on: 002, 004
- ADR: ADR-0001

## Goal

Add only the branded IDs, `MaybePromise`, exhaustive checks, and immutable helpers required by schema work.

## Acceptance criteria

- [ ] Every export has at least two planned consumers or a boundary-level purpose.
- [ ] No domain or infrastructure concept enters Shared.

## Tests

- [ ] Runtime and type tests cover each exported primitive.
