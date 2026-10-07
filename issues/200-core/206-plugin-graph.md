# 206: Resolve plugin dependencies and conflicts

- Status: completed
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 205
- ADR: ADR-0047

## Goal

Validate and topologically order the global plugin graph.

## Acceptance criteria

- [x] Required, optional, conflict, duplicate, and cycle errors are typed.
- [x] Dependencies order first; configuration position breaks ties.
- [x] Ordering is reproducible.

## Tests

- [x] Graph fixtures cover every failure and tie case.
