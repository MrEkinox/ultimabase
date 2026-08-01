# 517: Add PostgreSQL table naming

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 103, 502
- ADR: ADR-0002, ADR-0007, ADR-0014, ADR-0078

## Goal

Map schema class names to plural snake-case PostgreSQL tables while allowing an unrestricted explicit override through a PostgreSQL-owned schema extension.

## Acceptance criteria

- [x] `BlogPost` maps deterministically to `blog_posts`.
- [x] `postgresTable({ name })` preserves a non-empty explicit name verbatim.
- [x] Table-name generation and validation remain outside Schema and Runtime.
- [x] PostgreSQL identifiers are escaped safely before reaching Drizzle.

## Tests

- [x] Inflection edge cases, exact overrides, and invalid empty names are covered.

## Validation

- Default naming uses the established zero-dependency `inflection` package.
- Runtime and compile-time tests cover irregular plurals, literal preservation,
  malformed JavaScript input, immutable extension metadata, handler ownership,
  and Drizzle identifier quoting.
- `postgresTable` is the only new public runtime export; the resolver and
  extension identities remain internal to the PostgreSQL package.
