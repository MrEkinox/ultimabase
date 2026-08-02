# 330: Execute the native hook lifecycle

- Status: ready
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 320, 327, 328, 329, 344
- ADR: ADR-0015, ADR-0070, ADR-0089, ADR-0090, ADR-0096, ADR-0097, ADR-0099, ADR-0100

## Goal

Compile native schema, inline field, and plugin contributions into one fixed,
transaction-aware Runtime hook lifecycle.

## Acceptance criteria

- [ ] Native schema and field hooks are installed automatically without a hook plugin or schema extension handler.
- [ ] Field resolution precedes schema resolution, transformed data is structurally revalidated, and field validation precedes schema validation.
- [ ] Plugin/global, schema, and affected-field before/after phases follow the fixed wrapping order from ADR-0089.
- [ ] Operation transforms finish before `prepare()`; matched affected-field before hooks run before the handle is consumed exactly once, and after/onChange hooks consume complete materializations rather than selected public results.
- [ ] Singular `update-one` and `delete-one` with `target: null` execute without affected-field hooks; set-based `update-many` and `delete-many` never synthesize item hooks.
- [ ] Upsert field hooks visit each present branch-neutral candidate in deterministic create-then-update order; only after hooks observe the materialized database branch.
- [ ] Fields run sequentially in declaration order with deterministic nested-object traversal.
- [ ] Hook inputs and results are immutable snapshots with explicit transformation return contracts.
- [ ] Replacement operations and results are validated against the exact input terminal and selected fields, with path-aware errors for cross-terminal or incompatible runtime returns.
- [ ] The dispatcher can carry policy-neutral enforcement effects separately from hook-transformable operations without interpreting their payloads.
- [ ] Master authority still executes validation, business hooks, transactions, and post-commit work.
- [ ] Missing hook phases require no placeholder contribution and cannot remove the transaction boundary.
- [ ] Existing ADR-0070 plugin factories remain compatible as the low-level contribution API.

## Tests

- [ ] One trace fixture proves every phase and nested scope order.
- [ ] Transformation, structural revalidation, validation aggregation, access isolation, and rollback tests.
- [ ] Compile-time tests preserve exact schema, operation, field, and result inference through dispatch.

## Out of scope

- Read-specific result transformation.
- Transaction finalization hooks.
