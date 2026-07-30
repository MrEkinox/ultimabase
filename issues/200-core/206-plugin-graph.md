# 206: Resolve plugin dependencies and conflicts

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 205
- ADR: ADR-0003

## Goal

Validate and topologically order the global plugin graph.

## Acceptance criteria

- [ ] Required, optional, conflict, duplicate, and cycle errors are typed.
- [ ] Dependencies order first; configuration position breaks ties.
- [ ] Ordering is reproducible.

## Tests

- [ ] Graph fixtures cover every failure and tie case.
