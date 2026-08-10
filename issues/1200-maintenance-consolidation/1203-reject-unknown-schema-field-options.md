# 1203: Reject unknown built-in field options

- Status: ready
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1202
- ADR: ADR-0030, ADR-0037

## Goal

Make every official field factory reject unsupported root and nested option
keys at runtime instead of retaining silent misspellings in normalized metadata.

## Acceptance criteria

- [ ] Every built-in field factory owns an explicit accepted root-option set.
- [ ] Every built-in validation block owns an explicit accepted nested-option set.
- [ ] Unknown root keys and validation keys throw with the exact field kind and option path.
- [ ] Common validation is reused without erasing built-in-specific accepted keys.
- [ ] Plugin-owned field options remain validated by their owning plugin contract; Core does not guess future plugin keys.
- [ ] Valid options, immutable snapshots, inference, defaults, lists, extensions, and generated facts remain unchanged.
- [ ] Schema examples and field documentation are reviewed for the stricter boundary.

## Tests

- [ ] JavaScript-shaped runtime tests cover root and nested misspellings for every built-in factory family.
- [ ] Existing compile-time, runtime, FieldBuilder, Typegen, and packed-field tests pass.
- [ ] Focused tests prove valid plugin-owned metadata is not rejected by a built-in allowlist.

## Out of scope

- A new field declaration syntax.
- New field options or validation capabilities.
- Typegen performance measurement.
