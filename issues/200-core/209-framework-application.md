# 209: Implement FrameworkApplication

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 113, 203, 206, 207, 208
- ADR: ADR-0001, ADR-0003

## Goal

Create isolated application instances from explicit schemas and plugin definitions.

## Acceptance criteria

- [ ] Creation validates configuration without starting transports.
- [ ] `start`, `stop`, and `dispose` use lifecycle phases.
- [ ] Plugin exports are typed by literal name.
- [ ] No global singleton is introduced.

## Tests

- [ ] Several applications run concurrently without leakage.
