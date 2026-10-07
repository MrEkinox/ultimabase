# Milestone 10 — Singular identifier target aliases

- Status: completed

Make the common schema-root identifier mutation path concise without adding a
second execution model. `updateOne` and `deleteOne` accept `id` as an alias for
their existing canonical identifier predicate, while every downstream layer
continues to receive the ordinary `where` form.

## Execution order

1. [1001 — Add singular identifier target aliases](1001-singular-id-target-aliases.md)
2. [1002 — Verify generated and packed identifier alias DX](1002-singular-id-alias-verification.md)

The completed constraints and validation evidence live in the
[archived milestone plan](../../docs/plans/completed/singular-identifier-target-aliases.md).
