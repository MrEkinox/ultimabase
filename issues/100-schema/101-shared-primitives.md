# 101: Add foundational shared primitives

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/shared`
- Depends on: 002, 004
- ADR: ADR-0001

## Goal

Add only the branded IDs, `MaybePromise`, exhaustive checks, and immutable helpers required by schema work.

## Acceptance criteria

- [x] Every export has at least two planned consumers or a boundary-level purpose.
- [x] No domain or infrastructure concept enters Shared.

## Tests

- [x] Runtime and type tests cover each exported primitive.

## Implementation notes

- Added `Brand` and `MaybePromise` as type-only boundary primitives.
- Added `assertNever`, `immutableArray`, and `immutableRecord` without external dependencies.
- Kept immutable helpers shallow so nested values remain the responsibility of their own construction boundary.
