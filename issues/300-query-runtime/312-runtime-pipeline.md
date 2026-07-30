# 312: Implement deterministic Runtime pipeline

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 207, 307, 310, 311
- ADR: ADR-0004, ADR-0015

## Goal

Run normalization, validation, access, hooks, adapter execution, and events through one pipeline.

## Acceptance criteria

- [ ] Every stage has a typed input/output contract.
- [ ] Stages cannot silently skip required predecessors.
- [ ] Pipeline errors preserve framework error codes.

## Tests

- [ ] Trace fixture proves exact stage order.
