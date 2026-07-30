# 107: Implement enumField

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Infer a literal union from an immutable list of enum values.

## Acceptance criteria

- [x] Empty enums are rejected.
- [x] Duplicate values are rejected.
- [x] Output and input retain the exact union.
- [x] String enums and symbolic key-value mappings are supported.

## Tests

- [x] Runtime validation metadata and compile-time union tests.

## Implementation notes

- Inline lists preserve their literal union without requiring `as const`.
- Mapping keys remain metadata while mapping values define the persisted union.
- Native TypeScript string enums use the mapping path; numeric enums are rejected.
- Empty sources, duplicate persisted values, and defaults outside the domain fail early.
