# 313: Implement FrameworkEngine and RequestEngine

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 209, 309, 310, 312
- ADR: ADR-0004, ADR-0013

## Goal

Create global and request-bound engine classes per application.

## Acceptance criteria

- [ ] FrameworkEngine creates anonymous, user, and trusted master engines.
- [ ] RequestEngine exposes Query and transaction APIs.
- [ ] Engines cannot be reused across applications accidentally.

## Tests

- [ ] Parallel application and context isolation.
