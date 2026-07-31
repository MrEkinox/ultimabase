# 208: Implement lifecycle manager

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 206, 207
- ADR: ADR-0003, ADR-0015, ADR-0049

## Goal

Run setup, connect, schema preparation, runtime start, transport start, stop, and dispose phases deterministically.

## Acceptance criteria

- [x] Teardown reverses dependency order.
- [x] Partial-start failure disposes completed work.
- [x] Start, stop, and dispose are idempotent where documented.

## Tests

- [x] Failure injection verifies cleanup order.
