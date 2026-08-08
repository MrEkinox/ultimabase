# ADR-0111: Non-atomic bulk hook semantics

- Status: superseded by ADR-0164
- Date: 2026-08-03
- Refines: ADR-0069, ADR-0089, ADR-0099, ADR-0100, ADR-0105

## Context

Create-many and upsert-many already expose an `atomic` grouping option, but the
partial-success result, stopping point, hook order, and transaction behavior
were intentionally deferred. Leaving those details adapter-defined would make
GraphQL and other transports guess whether a rejected promise lost successful
items, and could let database plugins disagree about which hooks or post-commit
effects correspond to persisted data.

Turning a bulk terminal into independent Runtime operations would provide
per-item errors but would duplicate operation hooks, adapter setup, transaction
journals, and post-commit delivery. It would also erase the performance and
semantic distinction between a collection terminal and future itemized update
or delete terminals.

## Decision

Create-many and upsert-many remain one normalized operation with one
operation-level before/after hook cycle. Field input hooks visit every item in
stable input order. Adapter materializations drive field after and change hooks
for successful results in the same order.

The default and `{ atomic: true }` retain the all-or-nothing contract: the
terminal resolves to an immutable result array, and any failure rejects and
rolls back the complete transaction.

`{ atomic: false }` selects an explicit discriminated result:

```ts
type NonAtomicBulkResult<T> =
	| { readonly status: 'completed'; readonly results: readonly T[] }
	| {
			readonly status: 'stopped'
			readonly results: readonly T[]
			readonly failedIndex: number
			readonly error: unknown
	  }
```

The adapter processes persistence in stable input order and stops at the first
persistence failure. `results` contains only the successful prefix,
`failedIndex` equals `results.length`, and no later input is attempted. A fully
successful collection returns `completed` with one result for every input.

The complete operation still runs inside one outer Runtime transaction. A
stopped adapter outcome is data, not a rejected promise, so result hooks and
`beforeCommit` can observe the partial result. The prefix commits only if those
remaining pre-commit phases succeed. Validation, enforcement, any before or
after hook failure, and `beforeCommit` failure still reject and roll back the
whole transaction. Post-commit events and finalization hooks run once, after
the successful prefix has actually committed.

Result hooks may transform successful result records and may redact the opaque
error, but they cannot change `status` or `failedIndex`. Those discriminants are
adapter-owned persistence truth rather than presentation data.

Database adapters own the mechanism required to recover from one failed item
without invalidating the outer transaction. PostgreSQL therefore needs an
item-local savepoint or an equivalent safe mechanism before it can implement
this contract.

Set-based `updateMany` and `deleteMany` remain one adapter statement, one
operation-level hook cycle, and an affected-row count. Runtime never loads
matching rows or fabricates field materializations for them. Per-object update
or delete behavior belongs to the explicit itemized terminals in issue 336.

## Consequences

- Callers cannot silently lose a successful prefix or infer partial success
  from a rejected promise.
- Hooks and transaction finalization retain one operation identity and one
  real commit boundary.
- Database plugins must return cardinality-safe materializations for only the
  successful prefix.
- A non-atomic persistence error is observable as `unknown`; callers must
  narrow it before reading implementation-specific details.
- PostgreSQL bulk support must implement recovery from the failed item before
  committing the prefix.
