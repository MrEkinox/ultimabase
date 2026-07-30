# 517: Add PostgreSQL table naming

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 103, 502
- ADR: ADR-0002, ADR-0007, ADR-0014

## Goal

Map schema class names to plural snake-case PostgreSQL tables while allowing an unrestricted explicit override through a PostgreSQL-owned schema extension.

## Acceptance criteria

- [ ] `BlogPost` maps deterministically to `blog_posts`.
- [ ] `postgresTable({ name })` preserves a non-empty explicit name verbatim.
- [ ] Table-name generation and validation remain outside Schema and Runtime.
- [ ] PostgreSQL identifiers are escaped safely before reaching Drizzle.

## Tests

- [ ] Inflection edge cases, exact overrides, and invalid empty names are covered.
