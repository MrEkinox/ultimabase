# 2502: Restrict embedded built-in field declarations

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2501
- ADR: proposed ADR-0244

## Goal

Make `EmbeddedFieldBuilder` advertise and accept only built-in behavior Core can
execute for a concrete property of an object field.

## Acceptance criteria

- [ ] Every built-in embedded factory has a named context-specific option type
      rather than inheriting the complete stored-root factory signature.
- [ ] Autocomplete omits root-only indexes, relationships, dedicated-column
      generators, and every other capability rejected by ADR-0244.
- [ ] Requiredness, nullability, lists, defaults, immutability, normalization,
      structural validation, and occurrence-aware behavior remain available
      exactly where the existing Runtime supports them.
- [ ] Nested object builders apply the same restrictions recursively without
      losing exact field-map or list inference.
- [ ] Untyped JavaScript, stale generated declarations, low-level factories, and
      plugin-patched schemas receive the same precise compilation errors as
      invalid TypeScript declarations.
- [ ] A removal audit deletes superseded permissive aliases and updates object
      examples and Core documentation.

## Tests

- [ ] Source and compiled language-service tests protect suggestions and rejected
      options for every built-in embedded factory.
- [ ] Runtime declaration tests cover every removed capability and every retained
      embedded behavior.

## Out of scope

- Output-only descriptors, virtual fields, or plugin-owned field declarations.
- Adding an adapter-specific nested JSON-path index contract.
