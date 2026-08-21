# 354: Focus schema hook results on persisted items

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/roles-plugin`
- Depends on: 351
- ADR: ADR-0172

## Goal

Make item-oriented schema hooks expose one complete persisted model and remove
the redundant schema transaction-hook lifecycle.

## Acceptance criteria

- [x] `afterOperation.item` is a complete selection-independent
      `SchemaResult`, with `null` reserved for deletion.
- [x] `afterOperation` no longer exposes the caller-facing mutation `result`.
- [x] Public `transaction.beforeCommit` and `transaction.afterCommit` schema
      hooks and their internal journal are removed.
- [x] Post-commit integrations queue named events through `context.emit()` from
      an operation hook.
- [x] The normalized `operation` remains available while relation mutation
      actions have no materialized item representation.
- [x] Public exports, IntelliSense fixtures, runtime tests, examples, and
      architecture documentation describe the focused contract.

## Out of scope

- A Parse-style field-operation accessor on schema models.
- Removing the normalized operation from relation-aware hooks.
- Changing low-level plugin hooks or adapter transaction semantics.
