# 326: Declare inline field hooks

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 324, 325
- ADR: ADR-0088, ADR-0089

## Goal

Allow every built-in and plugin-defined field to declare value-focused hooks
without losing compact field inference or editor help.

## Acceptance criteria

- [x] Common field options expose inline `hooks` with documented completion and hover help.
- [x] Inline declarations support `resolveInput`, `validate`, compatible CRUD/save before and after phases, `resolveOutput`, `onChange`, `afterCommit`, `afterRollback`, and `onError`.
- [x] Field handlers infer the exact logical value for scalars, enums, objects, nested lists, nullable values, and plugin-defined fields.
- [x] Field handlers receive precise previous/current/change metadata while omitted values are not represented as fabricated executions.
- [x] Cross-field values are deliberately unavailable or non-specific inline; the documentation directs cross-field rules to schema hooks.
- [x] `resolveOutput` runs only after field access enforcement, preserves the logical field type, and never changes stored data.
- [x] `onChange` runs only for a semantic persisted-value change and exposes pre-commit or post-commit timing explicitly.
- [x] Set-based update and delete never fabricate field executions by loading matching rows.
- [x] Hook functions and options do not change `InferObject`, `InferCreateInput`, `InferUpdateInput`, or compact factory return hovers.
- [x] Nested object fields follow a documented deterministic traversal.
- [x] The package examples and README include inline and cross-field guidance.

## Tests

- [x] Runtime declaration and immutability tests for every built-in field family and one plugin-defined field.
- [x] Compile-time exact-value, nullability, list-depth, enum, object, and custom-field tests.
- [x] TypeScript language-service regressions protect field option help and compact hovers.

## Out of scope

- Pretending an inline field factory can infer the complete future schema.
- Allowing output hooks to change the public logical type.
