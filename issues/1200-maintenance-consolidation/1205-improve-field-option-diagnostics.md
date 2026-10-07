# 1205: Improve invalid field-option diagnostics

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1204
- ADR: ADR-0019, ADR-0038, ADR-0040

## Goal

Replace misleading rest-argument arity failures for invalid field-option
combinations with actionable TypeScript diagnostics while preserving exact
valid inference.

## Acceptance criteria

- [x] Invalid enum, pointer, temporal, integer, bigint, and compact scalar combinations identify the incompatible option contract rather than reporting a missing positional argument.
- [x] Empty enum domains, required pointers with `onDelete: 'setNull'`, incompatible `autoNow`, list, default, and auto-increment forms remain rejected.
- [x] Valid zero-argument and option-bearing factory calls retain compact hovers and autocomplete.
- [x] The canonical replacement removes `InvalidOptionsArguments` when no supported consumer remains.
- [x] Runtime guards remain authoritative for untyped input and agree with static rejection.
- [x] No `any`, assertion-hidden public boundary, generated helper property, or extra runtime argument is introduced solely for diagnostics.

## Tests

- [x] Type and language-service tests assert representative diagnostic messages or stable actionable fragments.
- [x] Packed declarations reproduce the same invalid-combination diagnostics.
- [x] Existing factory inference and runtime validation suites pass.

## Validation evidence

- Source and packed language-service tests assert 14 invalid direct-factory and
  `FieldBuilder` calls. Diagnostics point to `values`, `onDelete`,
  `autoIncrement`, `default`, or the incompatible temporal option contract and
  never request a synthetic positional argument.
- `InvalidOptionsArguments` and every consumer were removed. Generated scalar,
  enum, pointer, and plugin options now carry compatibility on the primary
  `options` parameter without a helper property or runtime argument.
- Existing runtime guards continue to reject empty enum domains, required
  `setNull` pointers, incompatible temporal generation, invalid sequence flags,
  and scalar defaults for list fields.
- Repository tests pass with 283 files and 1,804 tests, including compile-time
  checks. Constraints, typecheck, lint, formatting, build, and Changesets
  validation pass.
- Packed-package validation passes with 6 files and 43 tests. Existing factory
  and `FieldBuilder` autocomplete and compact-hover matrices remain green.
- The Core README and schema field-options example document the primary-option
  diagnostics and confirm that no extra field-factory argument exists.

## Out of scope

- New validation features.
- A TypeScript language-service plugin.
- Changing valid field metadata or persisted values.
