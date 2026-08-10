# 1205: Improve invalid field-option diagnostics

- Status: planned
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1204
- ADR: ADR-0019, ADR-0038, ADR-0040

## Goal

Replace misleading rest-argument arity failures for invalid field-option
combinations with actionable TypeScript diagnostics while preserving exact
valid inference.

## Acceptance criteria

- [ ] Invalid enum, pointer, temporal, integer, bigint, and compact scalar combinations identify the incompatible option contract rather than reporting a missing positional argument.
- [ ] Empty enum domains, required pointers with `onDelete: 'setNull'`, incompatible `autoNow`, list, default, and auto-increment forms remain rejected.
- [ ] Valid zero-argument and option-bearing factory calls retain compact hovers and autocomplete.
- [ ] The canonical replacement removes `InvalidOptionsArguments` when no supported consumer remains.
- [ ] Runtime guards remain authoritative for untyped input and agree with static rejection.
- [ ] No `any`, assertion-hidden public boundary, generated helper property, or extra runtime argument is introduced solely for diagnostics.

## Tests

- [ ] Type and language-service tests assert representative diagnostic messages or stable actionable fragments.
- [ ] Packed declarations reproduce the same invalid-combination diagnostics.
- [ ] Existing factory inference and runtime validation suites pass.

## Out of scope

- New validation features.
- A TypeScript language-service plugin.
- Changing valid field metadata or persisted values.
