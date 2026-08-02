# 326: Declare inline field hooks

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 324, 325
- ADR: ADR-0088, ADR-0089

## Goal

Allow every built-in and plugin-defined field to declare value-focused hooks
without losing compact field inference or editor help.

## Acceptance criteria

- [ ] Common field options expose inline `hooks` with documented completion and hover help.
- [ ] Inline declarations support `resolveInput`, `validate`, compatible CRUD/save before and after phases, `resolveOutput`, `onChange`, `afterCommit`, `afterRollback`, and `onError`.
- [ ] Field handlers infer the exact logical value for scalars, enums, objects, nested lists, nullable values, and plugin-defined fields.
- [ ] Field handlers receive precise previous/current/change metadata while omitted values are not represented as fabricated executions.
- [ ] Cross-field values are deliberately unavailable or non-specific inline; the documentation directs cross-field rules to schema hooks.
- [ ] `resolveOutput` runs only after field access enforcement, preserves the logical field type, and never changes stored data.
- [ ] `onChange` runs only for a semantic persisted-value change and exposes pre-commit or post-commit timing explicitly.
- [ ] Set-based update and delete never fabricate field executions by loading matching rows.
- [ ] Hook functions and options do not change `InferObject`, `InferCreateInput`, `InferUpdateInput`, or compact factory return hovers.
- [ ] Nested object fields follow a documented deterministic traversal.
- [ ] The package examples and README include inline and cross-field guidance.

## Tests

- [ ] Runtime declaration and immutability tests for every built-in field family and one plugin-defined field.
- [ ] Compile-time exact-value, nullability, list-depth, enum, object, and custom-field tests.
- [ ] TypeScript language-service regressions protect field option help and compact hovers.

## Out of scope

- Pretending an inline field factory can infer the complete future schema.
- Allowing output hooks to change the public logical type.
