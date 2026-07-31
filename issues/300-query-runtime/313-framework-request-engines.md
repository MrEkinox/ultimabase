# 313: Implement FrameworkEngine and RequestEngine

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 209, 309, 310, 312
- ADR: ADR-0004, ADR-0013, ADR-0065

## Goal

Create global and request-bound engine classes per application.

## Acceptance criteria

- [x] FrameworkEngine creates anonymous, user, and internal trusted master engines.
- [x] RequestEngine exposes Query and transaction APIs.
- [x] Engines cannot be reused across applications accidentally.

## Tests

- [x] Parallel application and context isolation.
