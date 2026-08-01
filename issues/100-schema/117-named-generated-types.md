# 117: Add optional generated type identities

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 107, 108, 110
- ADR: ADR-0022

## Goal

Allow enum and object fields to expose a stable neutral identity while leaving
automatic naming and generator-specific rules outside Schema.

## Acceptance criteria

- [x] `enumField` and `objectField` accept an optional literal `typeName`.
- [x] Explicit names are preserved in immutable field metadata.
- [x] Empty and non-string runtime names are rejected.
- [x] Fields without `typeName` retain their existing metadata and inference.
- [x] Generator naming syntax and collision handling remain outside Schema.

## Tests

- [x] Runtime and type tests cover enum and object names and invalid values.
