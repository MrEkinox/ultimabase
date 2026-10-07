# ADR-0172: Focus schema hook results on persisted items

- Status: accepted
- Date: 2026-08-09
- Refines: ADR-0089, ADR-0096, ADR-0107, ADR-0163, ADR-0164, ADR-0166
- Supersedes: ADR-0105
- Refined by: ADR-0194

## Context

Schema mutation hooks exposed two representations of the same successful write:
the complete logical `item` pair and a selection-dependent public `result`.
That overlap made `afterOperation` harder to understand and encouraged business
logic to depend on a caller's result projection.

Schema-level `transaction.beforeCommit` and `transaction.afterCommit` added a
second lifecycle beside item-oriented operation hooks. Their change journal
also retained operation results only to reconstruct information already
available to each after-operation callback. Post-commit delivery already has a
separate commit-aware boundary through `HookContext.emit()` and named events.

The normalized operation remains temporarily necessary for relation updates.
Relation fields are executable handles rather than stored model values, so a
materialized item cannot yet describe whether a relation was connected,
disconnected, or replaced. The official roles plugin currently needs those
actions and targets.

## Decision

Schemas expose three hook groups: `resolveInput`, `beforeOperation`, and
`afterOperation`.

Every `afterOperation` callback receives a complete selection-independent
persisted schema model in `item`, or `null` after deletion. Its
`originalItem` is the complete persisted preimage where one exists. Both
non-null values are immutable `SchemaResult` instances with protected identity,
`get()`, `toJSON()`, relation reads, and regular instance commands.

`afterOperation` no longer exposes `result`. The selected mutation return value
remains owned by the caller-facing command and cannot affect hook input.

Public schema transaction hooks and their per-schema change journal are
removed. Transactional business work belongs in `beforeOperation` or
`afterOperation`, where throwing still aborts the automatic transaction.
Post-commit work is declared by calling `context.emit()` from an operation hook;
Runtime buffers the immutable event and delivers it only after the outer commit
succeeds.

The `operation` AST remains available to schema mutation hooks for now. This is
an explicit temporary exception for relation mutation metadata, not the
preferred business-data interface. A future field-operation value API may
replace that dependency, but this decision does not introduce one.

Low-level adapter transactions, automatic mutation transactions, rollback,
post-commit event buffering, and plugin hook ordering remain unchanged. Only
the schema-facing transaction journal and callbacks are removed.

## Consequences

- After-operation business logic has one canonical persisted value regardless
  of `select`.
- Schema hook autocomplete presents three responsibilities instead of two
  overlapping mutation finalization models.
- Post-commit integrations use the existing named-event contract rather than a
  second callback family.
- Collection commands still invoke operation hooks once per item inside one
  atomic transaction.
- Relation-aware hooks may inspect the normalized AST until a typed
  field-operation representation is designed.
