# Milestone 3 — Query and Runtime

Implement transport-neutral operations and the single execution engine.

Issue 323 closed the application assembly seam discovered before the first real
database E2E. Its original context is retained in the
[completed plan](../../docs/plans/completed/runtime-postgres-e2e.md).

The active hook issues refine the completed low-level hook and transaction
foundation into native schema and inline field hooks. They preserve issue 318
as the plugin-contribution foundation, remove permission-specific Runtime
stages, add automatic mutation transactions, and end with a PostgreSQL rollback
E2E. Their dependency-first execution order is recorded in
[`CURRENT_PLAN.md`](../../CURRENT_PLAN.md), including PostgreSQL transaction
issue 508 before the final E2E.

Issue 336 retains the explicit future itemized update/delete work without
placing it on the active hook-lifecycle critical path.

Issue 337 removes the old named permission stages after the native dispatcher
exists. CLP, ACL, field permissions, tenancy, and community policies then share
the same monotonic plugin-hook enforcement boundary.

Issue 338 adds the generic adapter compiler registry required to execute opaque
constraints against PostgreSQL. The registry remains policy-neutral: concrete
ACL, tenancy, or soft-delete constraint kinds belong to their owning plugins.

Issues 339–341 retain future class-oriented DX work outside the active native
hook critical path: immutable `UltimaObject` results, a transaction-bound
`HookContext`, and a server-side `QueryCursor` value object. They must preserve
plain adapter boundaries, transport-safe opaque cursor strings, and the ban on
Active Record persistence.
