# Milestone 44 — Runtime logical-operation typing

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `d97afb1b`

This milestone makes Core's exported Runtime stage contracts describe the
logical operations they already execute. Native database operations and
plugin-owned schema mutations keep distinct execution pipelines, while shared
policy, behavior, result, and commit boundaries accept their truthful closed
logical union without `as never` bridges.

## Execution order

- [x] [4401 — Type shared logical Runtime stages](4401-logical-runtime-stage-contracts.md)
- [x] [4402 — Remove schema-mutation Runtime casts](4402-schema-mutation-runtime-consumers.md)
- [x] [4403 — Complete parity and DX audit](4403-parity-and-dx-audit.md)

## Outcome

Shared Runtime contracts now expose the exact closed logical-operation union,
and the schema-mutation pipeline plus official policy/behavior engines consume
that union without native-operation bridge casts. CRUD and plugin mutation
execution remain distinct, all existing capabilities remain available, and the
complete repository validation is green.

If exact typing requires combining native CRUD and schema-mutation execution,
widening adapter authority, changing stage order, or exposing a new extension
mechanism, implementation stops for an architecture decision.

No push is authorized.
