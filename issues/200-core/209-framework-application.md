# 209: Implement FrameworkApplication

- Status: completed
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 113, 203, 206, 207, 208
- ADR: ADR-0001, ADR-0003, ADR-0050

## Goal

Create isolated application instances from explicit schemas and plugin definitions.

## Acceptance criteria

- [x] Creation validates configuration without starting transports.
- [x] `start`, `stop`, and `dispose` use lifecycle phases.
- [x] Plugin exports are typed by literal name.
- [x] No global singleton is introduced.

## Tests

- [x] Several applications run concurrently without leakage.
