# 1701: Compare migration JSON snapshots structurally

- Status: completed
- Milestone: 17
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0210

## Goal

Classify persisted adapter contribution snapshots by JSON value rather than by
object property insertion order.

## Acceptance criteria

- [x] Migration planning treats objects with the same recursively nested JSON properties as unchanged regardless of property insertion order.
- [x] Array order and actual JSON value changes remain significant.
- [x] The comparison accepts only the existing validated `JsonValue` boundary and remains an internal Core implementation detail.
- [x] Typegen rendering, contribution identity keys, and non-JSON Runtime comparisons are unchanged.

## Tests

- [x] Runtime coverage proves reordered root and nested object properties are equal.
- [x] Runtime coverage proves reordered arrays and changed primitive values are unequal.
- [x] Core typecheck, tests, lint, and build pass.

## Validation

- `yarn constraints`
- `yarn typecheck`
- `yarn test`: 350 files, 1,893 tests
- `yarn lint`: zero errors and 76 existing centralized file-size warnings
- `yarn build`, including clean `attw` and `publint` package checks
- `yarn format:check`

## Out of scope

- Standard Schema plugin-option interoperability, owned by issue 1702.
- A public general-purpose equality API.
- Replacing order-sensitive deterministic serialization used for identifiers or generated output.
