# 2605: Extend official Hooks for plugin-owned schema mutations

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Give each plugin-defined schema mutation its own optional official before and
after lifecycle while preserving one logical operation and transaction.

## Acceptance criteria

- [ ] Exact schema Hook options gain typed `beforeOperation` and
      `afterOperation` keys from the compiled mutation surface.
- [ ] Before callbacks receive the validated input, exact target and original
      item required by the descriptor; after callbacks receive the validated
      logical result, all through immutable documented contracts.
- [ ] Custom mutation callbacks run in deterministic dependency, plugin,
      contribution, and registration order under their exact owner attribution.
- [ ] Native update and delete Hooks do not fire solely because the custom
      mutation's physical plan uses an update or delete statement.
- [ ] Before and after failures abort and roll back the root transaction;
      beforeCommit, afterCommit, event, cancellation, and nested query semantics
      retain the existing official lifecycle.
- [ ] Compatible providers may contribute custom-operation callbacks through
      the public Hooks capability without borrowing another plugin's privileges.
- [ ] Omitting `hooksPlugin()` installs no callbacks and does not prevent the
      mutation from executing.
- [ ] Typegen, language-service tests, JavaScript validation, documentation, and
      packed exports expose only operations present in that application graph.

## Tests

- [ ] Lifecycle matrices cover ordering, item/result values, rollback,
      beforeCommit and afterCommit ordering, events, Master, no engine, two
      providers, and application isolation.
- [ ] Removal tests prove that physical statement kinds cannot manufacture
      native mutation Hooks.

## Out of scope

- Adding a Core-specific Hooks stage or requiring the official Hooks package.
