# 141: Generate temporal values with autoNow

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 139, 140
- ADR: ADR-0040

## Goal

Replace magic temporal default strings with explicit framework-owned clock
generation metadata.

## Acceptance criteria

- [x] `dateField`, `timeField`, and `dateTimeField` accept `autoNow: boolean`.
- [x] `autoNow: true` is mutually exclusive with `default` and list metadata.
- [x] Generated temporal fields are present in persisted output and optional in
      create input.
- [x] Caller-supplied create and update values remain allowed.
- [x] The former `default: "today"` and `default: "now"` forms are rejected.
- [x] Runtime documentation assigns generation to one operation-scoped clock.

## Tests

- [x] Runtime tests cover normalized metadata and invalid combinations.
- [x] Compile-time tests cover exact inference and rejected combinations.
- [x] Validation-plan tests cover create presence.
