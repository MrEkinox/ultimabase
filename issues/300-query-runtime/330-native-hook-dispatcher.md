# 330: Execute the native hook lifecycle

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`, `@ultimabase/schema`
- Depends on: 320, 327, 328, 329
- ADR: ADR-0015, ADR-0070, ADR-0089, ADR-0090

## Goal

Compile native schema, inline field, and plugin contributions into one fixed,
transaction-aware Runtime hook lifecycle.

## Acceptance criteria

- [ ] Native schema and field hooks are installed automatically without a hook plugin or schema extension handler.
- [ ] Field resolution precedes schema resolution, transformed data is structurally revalidated, and field validation precedes schema validation.
- [ ] Plugin/global, schema, and affected-field before/after phases follow the fixed wrapping order from ADR-0089.
- [ ] Fields run sequentially in declaration order with deterministic nested-object traversal.
- [ ] Hook inputs and results are immutable snapshots with explicit transformation return contracts.
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
