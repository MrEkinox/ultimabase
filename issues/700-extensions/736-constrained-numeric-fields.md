# 736: Add constrained numeric fields

- Status: planned
- Milestone: 7+
- Packages: standard-fields
- Depends on: 730
- ADR: none

## Goal

Add `portField`, `percentageField`, `positiveIntField`, `positiveDecimalField`,
`latitudeField`, and `longitudeField` as native numeric field presets.

## Acceptance criteria

- [ ] Port values use integer validation and the valid TCP/UDP port range.
- [ ] Percentage bounds and whether values use a zero-to-one or zero-to-one-hundred scale are explicit.
- [ ] Positive fields distinguish strictly positive values from values that also allow zero.
- [ ] Latitude and longitude use independent correct geographic bounds.
- [ ] Decimal-backed presets retain exact string inference and never convert through JavaScript numbers.
- [ ] Presets lower directly to their native numeric fields without requiring a runtime plugin when no logical handler is needed.

## Tests

- [ ] Runtime tests cover inclusive boundaries, rejected values, defaults, and lists.
- [ ] Compile-time tests preserve native integer, float, and exact-decimal inference.

## Out of scope

- Composite geographic points, spatial indexes, and money-with-currency values.
