# 3302: Flatten capability authoring

- Status: planned
- Milestone: 33
- Packages: `@ultimabase/core`
- Depends on: 3301
- ADR: ADR-0269

## Goal

Accept one ordered capability declaration list and derive provider, required,
and optional buckets internally without changing capability semantics.

## Acceptance criteria

- [ ] Authors no longer sort nominal providers and requirements into parallel object properties.
- [ ] Cardinality, lifetime, compatibility, ordering, optionality, phase access, disposal, and privilege checks remain unchanged.
- [ ] Capability inspection retains the existing normalized information.
- [ ] The superseded public input shape is removed after migration.

## Tests

- [ ] Core capability runtime and type suites cover every lifetime, cardinality, and requirement phase.

## Handoff

- Documentation impact: pending.
