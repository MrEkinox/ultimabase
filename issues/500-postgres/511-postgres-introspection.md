# 511: Introspect PostgreSQL schema state

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 501, 503, 504
- ADR: ADR-0008

## Goal

Read normalized tables, columns, defaults, indexes, and constraints from PostgreSQL catalogs.

## Acceptance criteria

- [x] Output is deterministic and comparable to desired metadata.
- [x] UltimaBase-managed and unrelated structures are distinguishable.
- [x] Unsupported live structures are reported, not guessed.

## Tests

- [x] Catalog row fixture matrix.

Live catalog mutation and comparison fixtures belong to issue 512, where the
direct policy creates and changes real structures through this snapshot.

## Out of scope

- ACL table metadata and compilation remain owned by issue 510 and are inspected only when that optional capability is installed.
