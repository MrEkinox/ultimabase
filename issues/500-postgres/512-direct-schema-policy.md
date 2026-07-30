# 512: Implement override, fail, and ignore schema policies

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 208, 511
- ADR: ADR-0008

## Goal

Prepare schemas directly when no migration plugin claims the lifecycle phase.

## Acceptance criteria

- [ ] Override preserves data when possible and permits destructive changes.
- [ ] Fail reports a deterministic diff and makes no mutation.
- [ ] Ignore performs no structural inspection.
- [ ] `renamedFrom` is honored.

## Tests

- [ ] Add/change/rename/drop fixtures for every policy.
