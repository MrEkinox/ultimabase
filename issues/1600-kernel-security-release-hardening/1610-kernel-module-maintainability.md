# 1610: Split oversized kernel and optional-product modules

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`, `@ultimabase/access-plugin`
- Depends on: 1606
- ADR: none

## Goal

Split the largest post-migration modules by existing responsibility before new
capabilities make their ownership and file-budget debt harder to reason about.

## Acceptance criteria

- [ ] Core capability token definitions, provider construction, requirement reading, and composition validation no longer reside in one oversized module.
- [ ] Hooks field-input traversal and Runtime dispatch are split along existing authoring, materialization, execution, and diagnostic responsibilities.
- [ ] Access authoring plan construction, mutable compilation state, and finalized lookup contracts are separated without changing the public protocol.
- [ ] New files fit the normal production line budget with no new baseline exemptions or local lint disables.
- [ ] Existing baseline entries decrease or disappear whenever a touched file shrinks.
- [ ] Imports continue through package public exports across package boundaries and no new cycle is introduced.
- [ ] The split contains no behavioral, public API, or future-generalization change.

## Tests

- [ ] Existing unit, type, E2E, coverage, lint, constraints, and build gates pass unchanged.
- [ ] Focused ownership and composition tests remain colocated with their new modules.

## Out of scope

- Redesigning the capability kernel.
- Adding new Hooks or Access behavior.
- Increasing a centralized file-size baseline.
