# 602: Implement honoServerPlugin

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/server-hono-plugin`
- Depends on: 601
- ADR: ADR-0009

## Goal

Provide the first HTTP server service using Hono and `@hono/node-server`.

## Acceptance criteria

- [ ] Existing Hono apps can be supplied.
- [ ] Otherwise a server listens on configurable port `1337`.
- [ ] Start and graceful shutdown follow application lifecycle.
- [ ] Multiple explicit server providers fail unless future mounting is configured.

## Tests

- [ ] Existing-app, auto-server, port, and shutdown tests.
