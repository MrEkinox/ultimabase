# 106: Implement booleanField and dateField

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0014

## Goal

Implement boolean and server-side Date field contracts.

## Acceptance criteria

- [x] Date inference is `Date`, not string.
- [x] Static and factory defaults remain distinguishable.
- [x] Transport serialization is not implemented in Schema.
- [x] Date min and max validation boundaries are represented.

## Tests

- [x] Defaults and inference are covered.

## Implementation notes

- `booleanField()` preserves boolean literals through the common field contract.
- `dateField()` snapshots valid static defaults and `validation.range.min/max` boundaries.
- Default functions remain rejected until issue 109 introduces an explicit factory wrapper.
- ISO serialization remains a transport responsibility.
