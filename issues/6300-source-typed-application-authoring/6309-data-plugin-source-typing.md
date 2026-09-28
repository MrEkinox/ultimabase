# 6309: Migrate Soft Delete, vector, and PostgreSQL source typing

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/pg-vector-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 6308
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate the data and persistence vertical to source typing while preserving
schema-local configuration, physical persistence behavior, transactions, and
all current specialized fields and commands.

## Acceptance criteria

- [ ] Soft Delete retains application defaults, direct schema exceptions such as `softDelete: false`, exact query visibility, mutations, restoration, hard-delete behavior, Access/Hooks interaction, and transaction semantics.
- [ ] pg-vector retains its exact current logical field configuration, immutable vector value, dimensions, structural validation, portable storage and GraphQL codecs, supported generic filters/index behavior, diagnostics, and stored-field builder context.
- [ ] Installing `pgVectorPlugin()` adds `field.vector()` only to that configured factory; absence and unrelated configured factories reject the method in source and at static compilation.
- [ ] The migration does not claim or add physical PostgreSQL vector columns, vector ordering, or vector-specific indexes; those remain future functionality.
- [ ] PostgreSQL retains adapter configuration, schema synchronization, metadata, `renamedFrom`, transaction-bound raw access, constraints, atomic deltas, relation behavior, lifecycle, and disposal.
- [ ] Plugin field builders, schema options, mutations, model commands, application operations, and their local result types infer from source without generated plugin declarations.
- [ ] Logical operations remain separate from physical plans, and protected constraints cannot be widened by persistence rewrites.
- [ ] Direct options configure only an installed unambiguous plugin instance; absence, ambiguity, conflicts, and invalid values retain focused source and Runtime diagnostics.
- [ ] Superseded Typegen descriptors and package-specific compatibility branches are removed as each package migrates.
- [ ] Package READMEs, schema examples, database examples, and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Existing unit, type, editor, PostgreSQL E2E, transaction, constraint, lifecycle, and persistence-plan suites migrate without dropped assertions.
- [ ] Source and packed applications cover plugin presence, absence, local exceptions, logical vector fields without physical persistence, and supported database operations without generated plugin-surface declarations.
- [ ] Locked TypeScript performance and memory budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every schema option, field, operation, plan, adapter, transaction, metadata, and lifecycle contract across the three packages.
- [ ] Audit the complete diff for hidden rows, incorrect hard deletion, transaction escape, widened constraints, logical/physical conflation, vector precision loss, adapter lifecycle leaks, private Core access, per-plugin bridges, stale Typegen, and documentation drift.
- [ ] Record each finding and correction in the handoff; rerun affected database and plugin verticals plus the complete cross-plugin audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; unavailable PostgreSQL evidence is not a passing result.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- A migration framework or database-specific behavior in Core.
- Physical PostgreSQL vector persistence, ordering, specialized indexes, algorithms, or other new database features.
- Changing logical operation semantics to simplify an adapter.
