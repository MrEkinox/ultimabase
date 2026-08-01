# 124: Add exact decimal fields

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 109, 115, 120
- ADR: ADR-0028

## Goal

Represent exact base-10 values without JavaScript floating-point precision
loss.

## Acceptance criteria

- [x] `decimalField()` exposes the `decimal` kind and exact string values.
- [x] Plain decimal syntax rejects lossy numbers and ambiguous representations.
- [x] Precision and scale metadata use validated safe-integer boundaries.
- [x] Exact range comparison never converts through JavaScript `number`.
- [x] Defaults, lists, inference, and validation plans retain decimal strings.
- [x] PostgreSQL `numeric` and transport codecs remain outside Schema.

## Tests

- [x] Runtime tests cover syntax, precision, scale, ranges, and large values.
- [x] Type tests cover defaults, lists, inference, and incompatible numbers.
- [x] Validation-plan tests cover decimal discrimination and constraints.
