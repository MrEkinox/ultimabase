# 204: Implement definePlugin

- Status: completed
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 201, 202
- ADR: ADR-0045

## Goal

Preserve literal plugin names, typed setup exports, dependencies, conflicts, hooks, and nested definitions.

## Acceptance criteria

- [x] Factory results are static definitions, not initialized instances.
- [x] Setup return types flow into plugin lookup.
- [x] Plugin definitions are immutable.

## Tests

- [x] Literal-name and export inference tests.
