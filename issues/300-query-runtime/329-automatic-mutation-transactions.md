# 329: Make every mutation automatically transactional

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 317, 323, 519
- ADR: ADR-0068, ADR-0069, ADR-0089, ADR-0098, ADR-0099

## Goal

Give every root mutation one adapter transaction so the native dispatcher can
later execute business hooks inside a rollback boundary it does not own.

## Acceptance criteria

- [x] Every singular and bulk create, update, upsert, and delete operation automatically uses the adapter transaction lifecycle.
- [x] The transaction-bound engine is installed through the existing asynchronous scope before the mutation pipeline executes, so `getCurrentEngine()` returns it.
- [x] Issue 329 introduces no temporary engine property in native hook inputs; the explicit `HookContext` capability remains issue 340.
- [x] `useMasterKey()` retains the current transaction lifetime and cannot create a side transaction.
- [x] The first pipeline or nested-operation failure marks the transaction rollback-only even when developer code catches the rejection.
- [x] Deferred post-commit effects flush only after the automatic outer commit and are discarded on rollback.
- [x] An existing explicit `RequestEngine.transaction()` is reused without opening a nested transaction.
- [x] `{ atomic: false }` never executes on the root adapter; collection grouping and partial-result semantics remain issue 334.
- [x] Reads remain non-transactional unless already executed through an explicit transaction.
- [x] Adapter transaction support is validated before a mutation can begin.

## Tests

- [x] Commit and rollback tests cover every singular and bulk mutation kind.
- [x] Context, master elevation, rollback-only, explicit transaction reuse, post-commit timing, and missing-adapter tests.
- [x] Regression tests prove `{ atomic: false }` still opens a transaction while root reads do not.

## Out of scope

- Non-atomic collection grouping and partial-result semantics, owned by issue 334.
- Executing native developer or plugin hooks, owned by issue 330.
- The public transaction-bound `HookContext` capability, owned by issue 340.
- Native commit, rollback, and error hooks, owned by issue 332.
- External systems that cannot join a database transaction.
