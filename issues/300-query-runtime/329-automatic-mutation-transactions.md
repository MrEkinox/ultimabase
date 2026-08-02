# 329: Make every mutation automatically transactional

- Status: ready
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 317, 323
- ADR: ADR-0068, ADR-0069, ADR-0089

## Goal

Give every root mutation one atomic boundary so database work started by its
business hooks cannot survive a later operation failure.

## Acceptance criteria

- [ ] Singular create, update, upsert, and delete operations automatically use the adapter transaction lifecycle.
- [ ] Set-based update-many and delete-many include their operation hooks in the same transaction as the adapter statement.
- [ ] A transaction-bound engine is installed before business hooks execute and is exposed through hook input and `getCurrentEngine()`.
- [ ] `useMasterKey()` retains the current transaction lifetime and cannot create a side transaction.
- [ ] The first hook or nested operation failure marks the transaction rollback-only even when later caught.
- [ ] Business after-hooks may abort before commit, while post-commit work remains buffered until the outer commit.
- [ ] An existing explicit `RequestEngine.transaction()` is reused without opening a nested transaction.
- [ ] Reads remain non-transactional unless already executed through an explicit transaction.
- [ ] Adapter transaction support is validated before a mutation can begin.

## Tests

- [ ] Commit and rollback tests cover every singular and set-based mutation kind.
- [ ] Regression tests prove before/after hook writes roll back with a failed primary mutation.
- [ ] Context, master elevation, rollback-only, explicit transaction reuse, and post-commit timing tests.

## Out of scope

- Non-atomic collection grouping and partial-result semantics, owned by issue 334.
- External systems that cannot join a database transaction.
