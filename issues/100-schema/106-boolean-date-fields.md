# 106: Implement booleanField and dateField

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0014

## Goal

Implement boolean and server-side Date field contracts.

## Acceptance criteria

- [ ] Date inference is `Date`, not string.
- [ ] Static and factory defaults remain distinguishable.
- [ ] Transport serialization is not implemented in Schema.

## Tests

- [ ] Defaults and inference are covered.
