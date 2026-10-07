# ADR-0012: Vitest and PostgreSQL isolation

- Status: accepted
- Date: 2026-07-30

## Decision

Use Vitest rather than Jest. PostgreSQL integration tests share one Testcontainers instance while isolating workers with PostgreSQL schemas.

## Consequences

ESM and TypeScript work without Jest’s experimental ESM path. Framework applications and registries must never be global mutable singletons.
