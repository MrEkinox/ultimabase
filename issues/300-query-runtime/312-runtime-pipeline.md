# 312: Implement deterministic Runtime pipeline

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 207, 307, 310, 311
- ADR: ADR-0004, ADR-0015, ADR-0064

## Goal

Run normalization, validation, access, hooks, adapter execution, and events through one pipeline.

## Acceptance criteria

- [x] Every stage has a typed input/output contract.
- [x] Stages cannot silently skip required predecessors.
- [x] Pipeline errors preserve framework error codes.

## Tests

- [x] Trace fixture proves exact stage order.
