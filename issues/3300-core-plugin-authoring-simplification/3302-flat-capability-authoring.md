# 3302: Flatten capability authoring

- Status: completed
- Milestone: 33
- Packages: `@ultimabase/core`
- Depends on: 3301
- ADR: ADR-0269

## Goal

Accept one ordered capability declaration list and derive provider, required,
and optional buckets internally without changing capability semantics.

## Acceptance criteria

- [x] Authors can place nominal providers and requirements in one ordered list without sorting them into parallel object properties.
- [x] Cardinality, lifetime, compatibility, ordering, optionality, phase access, disposal, and privilege checks remain unchanged.
- [x] Capability inspection retains the existing normalized information.
- [x] The grouped input is an explicitly internal milestone bridge; issue 3305 removes it after every official package and fixture has migrated.

## Tests

- [x] Core capability runtime and type suites cover every lifetime, cardinality, and requirement phase.

## Handoff

- Documentation impact: both. Core engineering documentation and the public
  Runtime and Infrastructure authoring guide now teach the flat list while
  documenting the unchanged normalized inspection view.
- The Core runtime and type suites prove that mixed declarations retain exact
  provider, required, and optional tuple types after normalization.
- Validation: `yarn typecheck`; `yarn workspace @ultimabase/core test` (259
  files, 1,319 tests); Core build including package checks; and
  `yarn website:validate` (17 files, 66 tests).
