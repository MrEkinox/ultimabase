# Current plan

## Objective

Milestone 21 makes Standard Schema field validation a single mutation-input
boundary. Core validates the complete canonical candidate once after all
optional `resolveInput` transformations, while reads, adapter results,
materializations, includes, and output projections retain structural snapshots
without replaying application validators. Arithmetic updates project their
complete resulting value from the already locked target for this pass while
remaining atomic adapter operations.

## Order

1. Issue 2101 — decide the single-pass mutation validation boundary (`ready`).
2. Issue 2102 — execute Standard Schema only on final mutation input (`planned`).
3. Issue 2103 — verify exact invocation and the complete vertical (`planned`).

## Resume point

Start issue 2101 by accepting ADR-0221. The ADR must state explicitly that
stored data is not revalidated during reads and that persistence integrity
remains the responsibility of Core structural snapshots, codecs, adapter
constraints, database constraints, and migrations. It must also specify how
`increment` and `decrement` validate their projected final value exactly once
without replacing the logical atomic operation.

ACL hardening issues 432 through 435 remain deliberately deferred until
explicit direction.
