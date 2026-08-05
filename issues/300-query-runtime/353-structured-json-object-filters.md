# 353: Add structured JSON and object Query filters

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 302, 303, 505
- ADR: ADR-0136

## Goal

Expose one flat transport-neutral filter vocabulary for `jsonField` and
`objectField`, while preserving exact object paths, values, and keys in
TypeScript.

## Acceptance criteria

- [x] Structural containment uses shared `contains` and `containedBy` builders instead of JSON-prefixed APIs.
- [x] `hasKey`, `hasAnyKeys`, and `hasAllKeys` apply to both structured field kinds and retain declared object keys.
- [x] `fieldPath(field, segments)` preserves nested segments explicitly and typed object paths reject unknown properties.
- [x] Equality, membership, null, string, containment, and key leaves may target the supported extracted path type without nesting another query language in the AST.
- [x] Structural operands and caller-owned arrays are snapshotted immutably; typed object containment accepts recursive partial values.
- [x] PostgreSQL compiles containment, key, and extraction nodes through parameterized JSONB operators and schema-guided codecs.
- [x] `jsonPathExists` and `jsonPathMatches` expose explicitly untyped source expressions with immutable JSON variables and typed structured targets.

## Tests

- [x] Type tests cover dynamic JSON paths and exact object paths, values, keys, and rejected combinations.
- [x] Runtime tests cover immutable AST leaves and malformed JavaScript boundaries.
- [x] PostgreSQL compiler tests cover JSONB operators, partial child codecs, and parameterization.
- [x] JSONPath tests cover expression normalization, target restrictions, variables, and parameterized PostgreSQL functions.

## Out of scope

- Plugin fields backed by portable JSON storage codecs.
- Replacing `@ultimabase/acl-postgres-plugin`.
