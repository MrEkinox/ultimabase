# 108: Implement jsonField and arrayField

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 104, 105, 106, 107
- ADR: ADR-0002

## Goal

Add JSON and typed arrays of supported primitive fields.

## Acceptance criteria

- [ ] JSON defaults to a safe JSON value type rather than `any`.
- [ ] Array element inference is preserved.
- [ ] Nested array support and depth policy are explicit.

## Tests

- [ ] Invalid JSON and invalid element types are rejected in fixtures.
