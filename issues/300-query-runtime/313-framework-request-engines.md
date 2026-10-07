# 313: Implement FrameworkEngine and RequestEngine

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 209, 309, 310, 312
- ADR: ADR-0004, ADR-0013, ADR-0065, ADR-0113

## Goal

Create global and request-bound engine classes per application.

## Acceptance criteria

- [x] FrameworkEngine creates anonymous, user, and internal trusted master engines.
- [x] RequestEngine exposes Query and transaction APIs.
- [x] Engines cannot be reused across applications accidentally.

## Tests

- [x] Parallel application and context isolation.

## Follow-up

Issue 350 removes `FrameworkEngine.user()` under ADR-0113. Plugins will derive
typed values on an anonymous request context and bind that context through the
existing application-owned engine boundary.
