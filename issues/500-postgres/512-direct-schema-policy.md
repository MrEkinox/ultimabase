# 512: Implement override, fail, and ignore schema policies

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 208, 511
- ADR: ADR-0008

## Goal

Prepare schemas directly when no migration plugin claims the lifecycle phase.

## Acceptance criteria

- [x] Override preserves data when possible and permits destructive changes.
- [x] Fail reports a deterministic diff and makes no mutation.
- [x] Ignore performs no structural inspection.
- [x] `renamedFrom` is honored.

## Tests

- [x] Add/change/rename/drop planner fixtures and direct-policy fixtures.

Live mutation coverage is completed by issues 516 and 518 because Docker is
not available in the current implementation environment.
