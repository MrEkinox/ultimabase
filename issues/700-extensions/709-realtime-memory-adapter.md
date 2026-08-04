# 709: Add in-memory realtime adapter

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/realtime-memory-plugin`
- Depends on: 708
- ADR: none

## Goal

Provide an isolated single-process realtime adapter for tests and development.

## Acceptance criteria

- [ ] Applications never share subscribers.
- [ ] Delivery happens only after commit.
