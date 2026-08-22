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

1. Issue 2101 — decide the single-pass mutation validation boundary (`completed`).
2. Issue 2102 — execute Standard Schema only on final mutation input (`ready`).
3. Issue 2103 — verify exact invocation and the complete vertical (`planned`).

## Resume point

Start issue 2102 by separating repeatable structural result snapshots from the
one final application-validation execution. Carry the prepared singular target
into final validation for exact arithmetic projection. Reject targetless upsert
and bulk arithmetic over validated fields when complete prepared targets are
unavailable; never validate a delta as a complete field value or force implicit
bulk item loading.

ACL hardening issues 432 through 435 remain deliberately deferred until
explicit direction.
