# ADR-0007: PostgreSQL and Drizzle boundary

- Status: accepted
- Date: 2026-07-30

## Decision

Drizzle and `pg` are internal implementation details of `@ultimabase/postgres`. Public code never imports Drizzle constructs.

## Consequences

UltimaBase retains ownership of its public schema and query contracts. Other database adapters remain possible, but the first implementation is explicitly PostgreSQL-focused.
