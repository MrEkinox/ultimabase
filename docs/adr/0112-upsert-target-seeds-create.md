# ADR-0112: Unique upsert targets seed create candidates

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0059, ADR-0069, ADR-0072, ADR-0089, ADR-0100

## Context

An upsert keeps its unique target query, create candidate, and update expression
as separate AST values. Without one additional invariant, a target such as
`email = "a@example.com"` could attempt to insert a create candidate containing
`email = "b@example.com"`. Targeting the framework `id` was also impossible in
practice because Runtime generated a different UUID for the create candidate.

PostgreSQL cannot safely repair this discrepancy after hooks have observed the
candidate. The value seen by input and before hooks must be the same value that
the adapter may persist.

## Decision

The distinct non-null equalities in a normalized unique target are authoritative
for the upsert create branch. Runtime seeds developer-owned target fields before
required-value validation, then applies reserved generated target fields such as
`id` after regular create generation. The complete reconciled candidate reaches
input, validation, enforcement, and before hooks.

If the developer supplies a target field in `create`, its value must deeply
equal the query value. A mismatch produces the stable `upsert.target` validation
issue before any adapter call. Revalidation repeats the invariant after every
operation transform, so hooks cannot redirect persistence away from the declared
target.

The AST still retains `query`, `target`, `create`, and `update` separately.
Adapters use the target field tuple as the physical conflict key and receive an
already reconciled create candidate.

## Consequences

- Upsert by framework `id` persists the requested identifier instead of a newly
  generated UUID.
- A required unique field may be supplied by the target query without producing
  a false missing-field error at Runtime's internal boundary.
- Field and schema hooks observe the exact create candidate that PostgreSQL may
  insert.
- Transports and adapters cannot silently reinterpret contradictory query and
  create values.
