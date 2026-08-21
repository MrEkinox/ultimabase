# 332: Add transaction finalization hooks

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 329, 330
- ADR: ADR-0068, ADR-0089

## Goal

Expose commit, rollback, and error lifecycle boundaries without confusing
per-operation hooks with outer transaction finalization.

## Acceptance criteria

- [x] Per-operation `afterCommit` handlers buffer until the successful outer commit and retain operation order.
- [x] `beforeCommit` runs once per participating schema and outer transaction with its accumulated immutable change summary and may abort.
- [x] `afterRollback` runs only after adapter rollback succeeds.
- [x] `onError` observes pre-transaction and transaction failures with phase and rollback-state metadata.
- [x] Finalization handler failures never hide the original error or claim a committed transaction was rolled back.
- [x] External effects have no access to an expired transaction engine.
- [x] Standalone automatic mutations and explicit multi-operation transactions share the same lifecycle.

## Tests

- [x] Commit, rollback, commit failure, rollback failure, and aggregated-error tests.
- [x] Multiple-operation ordering and post-commit buffering tests.
- [x] Expired-engine and immutable change-summary tests.

## Out of scope

- Durable external delivery, owned by the PostgreSQL outbox issue.
