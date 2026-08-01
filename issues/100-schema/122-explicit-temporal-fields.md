# 122: Add explicit temporal fields

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 106, 115
- ADR: ADR-0026

## Goal

Distinguish calendar dates, times of day, and complete date-times without using
ambiguous JavaScript `Date` or numeric timestamp contracts.

## Acceptance criteria

- [x] `dateField()` uses canonical `YYYY-MM-DD` calendar dates.
- [x] `timeField()` supports complete times with an explicit timezone policy.
- [x] `dateTimeField()` supports complete date-times with an explicit timezone
      policy.
- [x] `today` and `now` compile into operation-scoped runtime-clock defaults.
- [x] All temporal fields support common defaults, lists, indexes, and ordered
      ranges.
- [x] System creation and update values use zoned date-time strings.
- [x] PostgreSQL storage choices remain adapter concerns.

## Tests

- [x] Runtime tests cover invalid formats, timezone policies, ranges, and
      immutable metadata.
- [x] Type tests cover value representations, defaults, and common options.
- [x] Inference and validation-plan tests cover all temporal kinds.
