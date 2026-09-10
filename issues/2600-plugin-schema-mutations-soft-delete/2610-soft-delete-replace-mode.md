# 2610: Implement replace-delete mode

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, database adapters
- Depends on: 2609
- ADR: [ADR-0200](../../docs/adr/0200-protected-rewritable-persistence-plans.md), [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Make ordinary singular and ordered itemized delete commands write the protected
tombstone while preserving their complete logical delete semantics.

## Acceptance criteria

- [x] Effective `replace-delete` schemas contribute the accepted delete
      persistence-plan rewrite for singular and itemized collection deletes.
- [x] Access, Hooks, Runtime observers, audit, public errors, results, relation
      maintenance, cancellation, and transaction behavior continue to observe
      native logical delete rather than a synthetic update.
- [x] The physical update changes only the owned tombstone and retains every
      Core-protected target constraint in one atomic adapter statement.
- [x] Update Access, update Hooks, application validators, update inputs, and
      update-specific defaults or generators are not replayed.
- [x] REST DELETE, generated GraphQL delete, direct schema commands, and model
      commands keep their existing public names and response contracts.
- [x] Already tombstoned targets are invisible and follow ordinary missing
      delete semantics without revealing their existence.
- [x] Ordered generated collection deletes remain singular logical operations;
      one failure rolls back the entire batch and no partial success appears.
- [x] Disabled and explicit-mode schemas retain native hard-delete persistence.

## Tests

- [x] Runtime, Access, Hooks, REST, GraphQL, Yoga, PostgreSQL, relations, batch,
      rollback, Master, and application-isolation tests prove logical-delete
      parity over the physical update.
- [x] Removal tests prove no public update operation or duplicate lifecycle is
      manufactured.

## Out of scope

- Adding a separate public soft-delete command or changing native delete input
  and result shapes.

## Completion evidence

- Core's existing persistence rewriter gains an immutable multi-schema target
  without callbacks or predicates in the compiled plan. Untargeted and empty
  plans invoke no rewriter and append no provenance.
- The official plugin compiles only exact `replace-delete` schemas owned by its
  configured instance and rewrites their singular logical delete plan to one
  atomic `isDeleted = true` update. Ordered schema `deleteMany` remains a batch
  of singular deletes in one root transaction.
- PostgreSQL proves pre-delete results, protected target constraints,
  non-disclosing repeated deletes, direct and model commands, anonymous and
  Master execution, Access composition, delete-only Hooks and post-commit
  observers, and complete rollback after a later batch item fails.
- Explicit and disabled schemas physically delete their rows and never enter
  the rewriter callback. Application-local plan tests prove that equal class
  names in distinct applications do not share replacement targets.
- Existing REST, GraphQL, and Yoga suites remain unchanged because transports
  still dispatch the native logical delete; the rewrite occurs only below the
  shared Runtime persistence boundary.
- Verified with focused Core/type/package tests, PostgreSQL Testcontainers,
  `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `yarn typecheck`, `yarn test`, `yarn lint`, and
  `NODE_OPTIONS=--max-old-space-size=8192 yarn build`.
