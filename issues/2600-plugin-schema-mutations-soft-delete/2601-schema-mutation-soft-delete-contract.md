# 2601: Decide plugin-defined schema mutations and official soft delete

- Status: completed
- Milestone: 26
- Packages: architecture documentation
- Depends on: none
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Accept one exact generic schema-mutation contract and the complete official
soft-delete v1 semantics before implementation changes any public, Runtime,
policy, lifecycle, persistence, or transport boundary.

## Acceptance criteria

- [x] ADR-0245 refines ADR-0188, ADR-0192, ADR-0193, ADR-0200, ADR-0225,
      ADR-0232, ADR-0233, and ADR-0240 without rewriting accepted history.
- [x] The ADR defines one canonical owner-attributed schema mutation identity,
      static descriptor, target contract, handler boundary, transaction policy,
      result shape, public error vocabulary, model surface, and Typegen shape.
- [x] Target load, visibility, locking, protected constraints, persistence-plan
      compilation, result materialization, cancellation, callback attribution,
      and application isolation have one explicit Runtime order.
- [x] Optional official Access and Hooks derive typed custom-operation keys from
      the compiled graph while Core and independent engines remain free of
      concrete product vocabulary.
- [x] REST and GraphQL planning, exposure, collision, context, error, and schema
      enablement rules consume the same generic descriptor without gaining an
      engine or executable callback during static planning.
- [x] The soft-delete contract fixes `defaultMode`, direct schema inheritance
      and override semantics, the protected tombstone, both mutation modes,
      public explicit endpoints, and the absence of a schema allowlist.
- [x] Replace mode preserves logical delete Access, Hooks, audit, relation,
      result, itemized batch, and transaction semantics across a physical
      tombstone update.
- [x] Explicit mode preserves hard delete and gives `softDelete` independent
      Access and Hooks semantics without replaying native update or delete.
- [x] Restore and purge are defined as explicit audited Master-only server
      commands with no generated REST or GraphQL binding.
- [x] Include-deleted queries, configurable tombstones, deletion metadata,
      cascades, retention, nested soft delete, uniqueness reuse, partial indexes,
      and automatic purge remain explicitly outside v1.

## Tests

- [x] `yarn check:issues`, focused documentation tests, `yarn format:check`, and
      `git diff --check` pass.

## Completion evidence

- ADR-0245 accepts a dedicated `defineSchemaMutation()` specialization instead
  of widening arbitrary plugin-operation handlers or Core's native CRUD union.
- The decision fixes owner-only update effects, Master-only physical deletion,
  application handle and Typegen surfaces, the complete Runtime order, optional
  Access and Hooks discovery, static and late transport exposure, both official
  soft-delete modes, and private restore and purge semantics.
- `yarn check:issues` passed 9 tests. The focused active-contract documentation
  suite passed 5 tests with no TypeScript errors. `yarn format:check` and
  `git diff --check` passed.

## Out of scope

- Changing implementation or creating the future package before ADR-0245 is
  accepted.
