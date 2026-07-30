# 511: Introspect PostgreSQL schema state

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 501, 503, 504, 510
- ADR: ADR-0008

## Goal

Read normalized tables, columns, defaults, indexes, constraints, and ACL tables from PostgreSQL catalogs.

## Acceptance criteria

- [ ] Output is deterministic and comparable to desired metadata.
- [ ] UltimaBase-managed and unrelated structures are distinguishable.
- [ ] Unsupported live structures are reported, not guessed.

## Tests

- [ ] Catalog fixture matrix.
