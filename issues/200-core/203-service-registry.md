# 203: Implement isolated ServiceRegistry

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 202
- ADR: ADR-0044

## Goal

Register, retrieve, and dispose typed services per application.

## Acceptance criteria

- [x] Missing and duplicate services produce typed errors.
- [x] Registries have no global mutable state.
- [x] Optional lookup is distinct from required lookup.

## Tests

- [x] Multiple registries remain isolated.
