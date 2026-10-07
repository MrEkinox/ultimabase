# 2605: Extend official Hooks for plugin-owned schema mutations

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Give each plugin-defined schema mutation its own optional official before and
after lifecycle while preserving one logical operation and transaction.

## Acceptance criteria

- [x] Exact schema Hook options gain typed `beforeOperation` and
      `afterOperation` keys from the compiled mutation surface.
- [x] Before callbacks receive the validated input, exact target and original
      item required by the descriptor; after callbacks receive the validated
      logical result, all through immutable documented contracts.
- [x] Custom mutation callbacks run in deterministic dependency, plugin,
      contribution, and registration order under their exact owner attribution.
- [x] Native update and delete Hooks do not fire solely because the custom
      mutation's physical plan uses an update or delete statement.
- [x] Before and after failures abort and roll back the root transaction;
      beforeCommit, afterCommit, event, cancellation, and nested query semantics
      retain the existing official lifecycle.
- [x] Compatible providers may contribute custom-operation callbacks through
      the public Hooks capability without borrowing another plugin's privileges.
- [x] Omitting `hooksPlugin()` installs no callbacks and does not prevent the
      mutation from executing.
- [x] Typegen, language-service tests, JavaScript validation, documentation, and
      packed exports expose only operations present in that application graph.

## Tests

- [x] Lifecycle matrices cover ordering, item/result values, rollback,
      beforeCommit and afterCommit ordering, events, Master, no engine, two
      providers, and application isolation.
- [x] Removal tests prove that physical statement kinds cannot manufacture
      native mutation Hooks.

## Out of scope

- Adding a Core-specific Hooks stage or requiring the official Hooks package.

## Evidence

- Exact generated custom branches and immutable callback contracts live in
  `authoring/schema-mutation-contracts.ts`; startup normalization validates
  JavaScript declarations against the final application mutation surface.
- Runtime dispatch preserves `plugin-schema-mutation` identity through exact
  before/after phases, provider attribution, rollback, cancellation, nested
  transaction work, commit, and post-commit event delivery without replaying
  native update or delete Hooks.
- Focused lifecycle, Master, type, language-service, source-public, compiled
  public API, and packed-package tests pass.
- Repository gates pass: `yarn constraints`, `yarn format:check`,
  `yarn typecheck`, `yarn test` (481 files, 2,272 tests), `yarn lint` (baseline
  line-budget warnings only), and `yarn build`.
