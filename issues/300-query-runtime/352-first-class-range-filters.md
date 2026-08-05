# 352: Add first-class Query range filters

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 302, 306, 416, 505
- ADR: ADR-0135

## Goal

Expose inclusive `between` and inverse `notBetween` predicates as explicit
transport-neutral Query AST operations for every ordered scalar field.

## Acceptance criteria

- [x] Core defines field-correlated `between` and `not-between` AST nodes with exact non-null lower and upper bounds.
- [x] Query, schema-command predicates, native Access filters, and relation predicates expose immutable `between` and `notBetween` methods.
- [x] Runtime factories reject unsupported fields, list fields, invalid values, and null bounds.
- [x] PostgreSQL compiles both nodes with parameterized bounds.
- [x] Existing comparison operators also reject null at the runtime boundary.
- [x] Public documentation and IntelliSense describe inclusive and inverse semantics.

## Tests

- [x] Type tests cover supported ordered fields and reject unordered fields, lists, and null bounds.
- [x] Runtime tests preserve explicit immutable range nodes across every filter surface.
- [x] PostgreSQL compiler tests cover both operators and parameterization.
- [x] Repository typecheck, tests, lint, format, build, and packed declarations pass.

## Out of scope

- Exclusive or configurable bounds.
- JavaScript-side lower-versus-upper ordering checks.
- Rewriting ranges into logical comparison nodes.
