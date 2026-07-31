# 116: Replace arrayField with field list metadata

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 108, 112, 115
- ADR: ADR-0021

## Goal

Represent homogeneous lists as a common field option so scalar and object
factories retain their original kind and no dedicated `arrayField` API is
required.

## Acceptance criteria

- [x] Every developer field accepts `list: true`, `list: false`, or a non-empty
      tuple of `true` values.
- [x] Exact list depth is preserved by defaults, field values, and
      operation-specific inference.
- [x] Validation plans compile list metadata into array wrappers around the
      original field plan.
- [x] `arrayField`, `ArrayField`, and `ArrayFieldOptions` are removed from the
      public API.
- [x] Static list metadata and defaults are detached from caller-owned values.

## Tests

- [x] Runtime and type tests cover primitive, enum, JSON, object, nested-list,
      default, and validation-plan behavior.
