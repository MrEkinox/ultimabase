# 121: Add exact bigint fields

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 120
- ADR: ADR-0025

## Goal

Represent exact native bigint values independently from safe JavaScript number
integers.

## Acceptance criteria

- [x] `bigintField()` exposes the `bigint` kind and TypeScript `bigint` values.
- [x] Defaults and range boundaries require bigint values.
- [x] Bigint fields support common lists, indexes, presence, and auto-increment.
- [x] Validation plans retain exact bigint boundaries.
- [x] Numeric range ordering is shared without number coercion.
- [x] Transport serialization remains outside Schema.

## Tests

- [x] Runtime tests cover immutable metadata and invalid bigint ranges.
- [x] Type tests cover defaults, lists, inference, and invalid number mixing.
- [x] Validation-plan tests cover bigint discrimination and exact ranges.
