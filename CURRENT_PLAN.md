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
2. Issue 2102 — execute Standard Schema only on final mutation input (`completed`).
3. Issue 2103 — verify exact invocation and the complete vertical (`ready`).

## Resume point

Start issue 2103 with a responsibility-based caller audit, then exercise the
complete single-pass contract through public, packed, JavaScript, Typegen-free,
and PostgreSQL Testcontainers paths. Record exact invocation counts and prove
that stored values remain structurally readable without replaying Standard
Schema.

ACL hardening issues 432 through 435 remain deliberately deferred until
explicit direction.
