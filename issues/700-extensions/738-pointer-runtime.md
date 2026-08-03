# 738: Execute pointer reads and inclusion through Runtime

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 418, 702, 737
- ADR: ADR-0063, ADR-0099, ADR-0116, ADR-0118

## Goal

Execute pointer values, target queries, and inclusion through the same Runtime,
Access, hooks, and adapter boundary as ordinary schema operations.

## Acceptance criteria

- [ ] Database requests carry logical pointer predicates and inclusion plans through a versioned portable adapter capability.
- [ ] Included targets run the source field read decision and the target schema's complete operation, filter, item, field, and hook lifecycle.
- [ ] A missing target and an inaccessible target produce the same observable result without existence leakage.
- [ ] Pointer target queries inherit the current request or accept the same terminal-only authority options as ordinary Query execution.
- [ ] Business hooks cannot remove private pointer scopes or target Access constraints.
- [ ] Pointer create and update values use ordinary structural validation, field Access, hooks, and automatic mutation transactions.

## Tests

- [ ] Core Runtime tests cover allowed, denied, missing, selected, nested-hook, master, and rollback paths with a fixture adapter.

## Out of scope

- PostgreSQL compilation, to-many relations, transport batching, REST, and GraphQL.
