# 332: Add transaction finalization hooks

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 329, 330
- ADR: ADR-0068, ADR-0089

## Goal

Expose commit, rollback, and error lifecycle boundaries without confusing
per-operation hooks with outer transaction finalization.

## Acceptance criteria

- [ ] Per-operation `afterCommit` handlers buffer until the successful outer commit and retain operation order.
- [ ] `beforeCommit` runs once per outer transaction with its accumulated immutable change summary and may abort.
- [ ] `afterRollback` runs only after adapter rollback succeeds.
- [ ] `onError` observes pre-transaction and transaction failures with phase and rollback-state metadata.
- [ ] Finalization handler failures never hide the original error or claim a committed transaction was rolled back.
- [ ] External effects have no access to an expired transaction engine.
- [ ] Standalone automatic mutations and explicit multi-operation transactions share the same lifecycle.

## Tests

- [ ] Commit, rollback, commit failure, rollback failure, and aggregated-error tests.
- [ ] Multiple-operation ordering and post-commit buffering tests.
- [ ] Expired-engine and immutable change-summary tests.

## Out of scope

- Durable external delivery, owned by the PostgreSQL outbox issue.
