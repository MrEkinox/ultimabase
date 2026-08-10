# 1203: Reject unknown built-in field options

- Status: done
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1202
- ADR: ADR-0030, ADR-0037

## Goal

Make every official field factory reject unsupported root and nested option
keys at runtime instead of retaining silent misspellings in normalized metadata.

## Acceptance criteria

- [x] Every built-in field factory owns an explicit accepted root-option set.
- [x] Every built-in validation block owns an explicit accepted nested-option set.
- [x] Unknown root keys and validation keys throw with the exact field kind and option path.
- [x] Common validation is reused without erasing built-in-specific accepted keys.
- [x] Plugin-owned field options remain validated by their owning plugin contract; Core does not guess future plugin keys.
- [x] Valid options, immutable snapshots, inference, defaults, lists, extensions, and generated facts remain unchanged.
- [x] Schema examples and field documentation are reviewed for the stricter boundary.

## Tests

- [x] JavaScript-shaped runtime tests cover root and nested misspellings for every built-in factory family.
- [x] Existing compile-time, runtime, FieldBuilder, Typegen, and packed-field tests pass.
- [x] Focused tests prove valid plugin-owned metadata is not rejected by a built-in allowlist.

## Validation evidence

- Runtime matrices cover unknown root keys across all 16 built-in kinds,
  unknown `validation` keys across the 15 value-field kinds, and unknown shared
  `validation.length` and `validation.range` keys.
- A plugin-field regression keeps plugin-owned root and validation metadata
  intact through its own normalizer.
- The Core suite passes with 196 files and 1,429 tests; the repository suite
  passes with 280 files and 1,786 tests, including compile-time coverage.
- Constraints, typecheck, lint, formatting, build, and Changesets validation
  pass. Packed-package validation passes with 5 files and 42 tests.
- The Core README, Schema guide, and required field-options example document
  the strict JavaScript declaration boundary and plugin ownership exception.

## Out of scope

- A new field declaration syntax.
- New field options or validation capabilities.
- Typegen performance measurement.
