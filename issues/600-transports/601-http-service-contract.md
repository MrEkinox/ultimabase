# 601: Define HTTP server service contract

- Status: ready
- Milestone: 6
- Packages: `@ultimabase/core`
- Depends on: 202, 207, 208
- ADR: ADR-0009

## Goal

Allow transports to mount Fetch-compatible handlers without knowing Hono, Express, or Fastify.

## Acceptance criteria

- [ ] Route/mount ownership records the contributing plugin.
- [ ] Duplicate paths and incompatible server providers fail clearly.
- [ ] The contract supports existing and framework-created servers.

## Tests

- [ ] Fake-server contract tests.
