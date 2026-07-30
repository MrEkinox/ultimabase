# 604: Create REST request contexts

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/rest`
- Depends on: 310, 314, 601
- ADR: ADR-0013

## Goal

Normalize request ID, auth input, source, metadata, and trusted master headers into RequestEngine scopes.

## Acceptance criteria

- [ ] Raw master keys are verified by a service and never retained.
- [ ] Arbitrary body/query values cannot enable master.
- [ ] AsyncLocalStorage covers the full handler.

## Tests

- [ ] Anonymous, user, valid master, and forged master requests.
