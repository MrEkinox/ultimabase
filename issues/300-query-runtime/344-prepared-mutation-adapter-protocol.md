# 344: Define the prepared mutation adapter protocol

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 311, 329, 507, 519
- ADR: ADR-0063, ADR-0067, ADR-0069, ADR-0085, ADR-0089, ADR-0098, ADR-0099, ADR-0100

## Goal

Give Runtime a portable, transaction-bound preparation and execution protocol
that supplies stable mutation snapshots to field hooks without exposing internal
materialization through selected public results.

## Acceptance criteria

- [x] `DatabaseTransactionAdapter` requires the prepared-mutation protocol; Runtime sends only reads to the root adapter and starts a transaction for every mutation.
- [x] Preparation returns an opaque, immutable, single-use handle owned by the exact transaction adapter that created it.
- [x] Runtime consumes every mutation through preparation inside its mandatory transaction; issue 330 inserts affected-field hooks between preparation and execution.
- [x] Execution returns an immutable internal outcome that keeps the exact public result separate from complete previous and current logical object states.
- [x] Materialized item outcomes use explicit `create`, `update`, or `delete` branches; absence is represented explicitly rather than with a fabricated `undefined` value.
- [x] `create-one` reports an absent previous state and a complete current state after persistence.
- [x] Matching `update-one` and `delete-one` operations expose one stable complete target; a non-matching operation exposes `target: null`, returns `null`, and emits no materialization so issue 330 can skip affected-field hooks.
- [x] Public selection remains exact even when Runtime needs additional internal fields for hooks, and internal snapshots never cross the public result boundary.
- [x] Prepared handles are closed over their owner transaction, cannot be rebound to another operation or schema, and reject repeated execution or execution after transaction finalization.
- [x] PostgreSQL implements prepared `create-one`, `update-one`, and `delete-one` on the transaction's borrowed client; update and delete targets remain stable under concurrent writes.
- [x] The protocol reserves ordered bulk and upsert outcomes without implementing their PostgreSQL execution in this issue.
- [x] Prepared upsert operations retain both immutable candidates without claiming a resolved branch; schema hooks receive the operation, while issue 330 invokes field hooks for present create then update candidate values.
- [x] Set-based `update-many` and `delete-many` remain non-materializing operations whose public result is only the affected-row count.

## Tests

- [x] Core contract and fake-adapter tests cover transaction closure, single use, terminal/schema preservation, no-match behavior, immutable snapshots, and projection isolation.
- [x] PostgreSQL tests cover full singular outcomes, deterministic target locking, concurrent update/delete behavior, rollback, and transaction-adapter expiry.
- [x] Compile-time tests preserve the exact operation, public result, branch, and logical object types without exposing PostgreSQL or Drizzle types.

## Out of scope

- PostgreSQL bulk and upsert execution, owned by issue 508.
- Executing native hook declarations, owned by issue 330.
- Public mutation-result wrappers or Active Record behavior.
