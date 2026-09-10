# 2610: Implement replace-delete mode

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, database adapters
- Depends on: 2609
- ADR: [ADR-0200](../../docs/adr/0200-protected-rewritable-persistence-plans.md), [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Make ordinary singular and ordered itemized delete commands write the protected
tombstone while preserving their complete logical delete semantics.

## Acceptance criteria

- [ ] Effective `replace-delete` schemas contribute the accepted delete
      persistence-plan rewrite for singular and itemized collection deletes.
- [ ] Access, Hooks, Runtime observers, audit, public errors, results, relation
      maintenance, cancellation, and transaction behavior continue to observe
      native logical delete rather than a synthetic update.
- [ ] The physical update changes only the owned tombstone and retains every
      Core-protected target constraint in one atomic adapter statement.
- [ ] Update Access, update Hooks, application validators, update inputs, and
      update-specific defaults or generators are not replayed.
- [ ] REST DELETE, generated GraphQL delete, direct schema commands, and model
      commands keep their existing public names and response contracts.
- [ ] Already tombstoned targets are invisible and follow ordinary missing
      delete semantics without revealing their existence.
- [ ] Ordered generated collection deletes remain singular logical operations;
      one failure rolls back the entire batch and no partial success appears.
- [ ] Disabled and explicit-mode schemas retain native hard-delete persistence.

## Tests

- [ ] Runtime, Access, Hooks, REST, GraphQL, Yoga, PostgreSQL, relations, batch,
      rollback, Master, and application-isolation tests prove logical-delete
      parity over the physical update.
- [ ] Removal tests prove no public update operation or duplicate lifecycle is
      manufactured.

## Out of scope

- Adding a separate public soft-delete command or changing native delete input
  and result shapes.
