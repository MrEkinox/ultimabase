# 203: Implement isolated ServiceRegistry

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 202
- ADR: ADR-0001

## Goal

Register, retrieve, and dispose typed services per application.

## Acceptance criteria

- [ ] Missing and duplicate services produce typed errors.
- [ ] Registries have no global mutable state.
- [ ] Optional lookup is distinct from required lookup.

## Tests

- [ ] Multiple registries remain isolated.
