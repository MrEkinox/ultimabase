# Milestone 55 — Schema command input contracts

- Status: completed
- Authorization: user request of 2026-09-27
- Baseline: `4697d76d`

This milestone consolidates repeated runtime shape declarations and collection
array checks at the schema-command boundary without changing command execution.

## Execution order

- [x] [5501 — Consolidate schema command input contracts](5501-consolidate-schema-command-input-contracts.md)

## Constraints

- Preserve every required, optional, and rejected key for every command shape.
- Preserve exact diagnostic paths, messages, and required-key order.
- Preserve itemization, selection, inclusion, targeting, and batch execution.
- Add no public API, command alias, input form, or compatibility decoder.
- Stop and revert if consolidation does not delete production lines overall.

No push is authorized.

## Outcome

One private table now declares every schema-command wrapper contract, and one
assertion owns the four collection-array diagnostics. Command construction and
execution remain unchanged. `schema-command-execution.ts` falls from 559 to 537
lines; production TypeScript removes 22 lines net.
