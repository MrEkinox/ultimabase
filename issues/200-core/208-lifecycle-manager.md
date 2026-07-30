# 208: Implement lifecycle manager

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 206, 207
- ADR: ADR-0003, ADR-0015

## Goal

Run setup, connect, schema preparation, runtime start, transport start, stop, and dispose phases deterministically.

## Acceptance criteria

- [ ] Teardown reverses dependency order.
- [ ] Partial-start failure disposes completed work.
- [ ] Start, stop, and dispose are idempotent where documented.

## Tests

- [ ] Failure injection verifies cleanup order.
