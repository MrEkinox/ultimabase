# 3010: Migrate schema mutations to the canonical graph

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/soft-delete-plugin`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 3009
- ADR: ADR-0259 and retained schema-mutation semantics from ADR-0245

## Goal

Run explicit Soft Delete and private restoration and purge through the canonical
command graph while preserving generic schema-mutation, policy, Hooks, and
transaction semantics.

## Acceptance criteria

- [ ] Schema-mutation definitions, target ownership, authority, payload,
      selected effect dependencies, handler, returning phase, errors, and
      surfaces compile into one canonical command.
- [ ] Explicit soft delete remains its own logical mutation; replace-delete
      remains a physical rewrite of native delete; restore and purge remain
      private audited Master commands.
- [ ] Existing tombstone visibility, non-disclosing target behavior,
      transactionality, relations, hooks, Access keys, and protected constraints
      remain unchanged.
- [ ] Access and Hooks derive generic command identities without importing or
      naming Soft Delete vocabulary.
- [ ] The plugin remains independent from Access, Hooks, REST, GraphQL, Yoga,
      PostgreSQL, and database implementations.
- [ ] Legacy schema-mutation declarations may remain only as a temporary adapter
      into the canonical graph and may not retain a second Runtime registry.

## Tests

- [ ] Direct TypeScript, JavaScript without Typegen, Access, Hooks, Master,
      relations, rollback, cancellation, REST, GraphQL, Yoga, packed, and
      PostgreSQL Soft Delete suites pass.
- [ ] Generic community-style schema mutation tests prove Core remains
      product-neutral.

## Audit gate

- [ ] Audit the complete mutation pipeline for changed logical identity,
      authorization coupling, existence disclosure, transaction escape,
      duplicate registration, and product vocabulary. Correct and repeat until
      green.
- [ ] Record behavior, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- Adding deletion timestamps, deleted reads, public restoration, or another
  Soft Delete feature.
