# 119: Add portable UUID fields

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 111, 115
- ADR: ADR-0023

## Goal

Represent developer-owned UUID values without coupling Schema to PostgreSQL
storage or generation behavior.

## Acceptance criteria

- [x] `uuidField()` preserves the `uuid` kind and canonical string inference.
- [x] UUID versions 1 through 8 may be selected through validation metadata.
- [x] UUID fields support common defaults, lists, indexes, and presence rules.
- [x] Developer and system UUIDs compile into one validation-plan shape.
- [x] PostgreSQL generation and storage options remain outside Schema.

## Tests

- [x] Runtime tests cover immutable metadata and invalid UUID versions.
- [x] Type tests cover literals, defaults, lists, and operation inference.
- [x] Validation-plan tests cover unrestricted and version-specific UUIDs.
