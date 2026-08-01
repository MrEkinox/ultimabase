# 511: Introspect PostgreSQL schema state

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 501, 503, 504
- ADR: ADR-0008

## Goal

Read normalized tables, columns, defaults, indexes, and constraints from PostgreSQL catalogs.

## Acceptance criteria

- [ ] Output is deterministic and comparable to desired metadata.
- [ ] UltimaBase-managed and unrelated structures are distinguishable.
- [ ] Unsupported live structures are reported, not guessed.

## Tests

- [ ] Catalog fixture matrix.

## Out of scope

- ACL table metadata and compilation remain owned by issue 510 and are inspected only when that optional capability is installed.
