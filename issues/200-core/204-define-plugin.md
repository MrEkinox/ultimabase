# 204: Implement definePlugin

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 201, 202
- ADR: ADR-0003

## Goal

Preserve literal plugin names, typed setup exports, dependencies, conflicts, hooks, and nested definitions.

## Acceptance criteria

- [ ] Factory results are static definitions, not initialized instances.
- [ ] Setup return types flow into plugin lookup.
- [ ] Plugin definitions are immutable.

## Tests

- [ ] Literal-name and export inference tests.
