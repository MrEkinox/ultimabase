# Milestone 3 — Query and Runtime

Implement transport-neutral operations and the single execution engine.

Issue 323 closed the application assembly seam discovered before the first real
database E2E. Its original context is retained in the
[completed plan](../../docs/plans/completed/runtime-postgres-e2e.md).

Issues 324–335 refine the completed low-level hook and transaction foundation
into native schema and inline field hooks. They preserve issue 318 as the
plugin-contribution foundation, add automatic mutation transactions, and end
with a PostgreSQL rollback E2E. Their dependency-first execution order is
recorded in [`CURRENT_PLAN.md`](../../CURRENT_PLAN.md), including PostgreSQL
transaction issue 508 before the final E2E.

Issue 336 retains the explicit future itemized update/delete work without
placing it on the active hook-lifecycle critical path.
