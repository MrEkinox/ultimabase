# Milestone 45 — Runtime boundary decoder consolidation

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `6fdb70f8`

This milestone removes the prepared-target and materialization decoding repeated
by Core, Access, and Hooks after milestone 44. Core keeps one validated boundary
and official engines consume it through the existing public Runtime kernel.

## Execution order

- [x] [4501 — Consolidate Runtime mutation boundary decoding](4501-consolidate-runtime-mutation-boundaries.md)

## Outcome

Core, Access, and Hooks now share one prepared-record decoder, and Access uses
Core's complete outcome validator. Production TypeScript is 41 lines smaller,
all existing capabilities remain available, and repository validation is green.

If consolidation changes Runtime order, adapter authority, target visibility,
materialization semantics, or merges native and plugin mutation execution, the
implementation stops for an architecture decision.

No push is authorized.
