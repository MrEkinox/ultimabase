# ADR-0345: Private storage inserts a record only if it is absent

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0234 (owner-private plugin storage); applies ADR-0288
- Approval: race found by the auth-plugin own-tests pass of 2026-10-17; accepted by the user on 2026-10-17

## Context

Owner-private storage (ADR-0234) offers `findUnique`, `insert`, `update`, `delete` and `compareAndSwap`. To create the
first record for a key under concurrency, the auth plugin reads, inserts when nothing exists, and on a unique violation
retries the loop (`attempts.ts` `recordAttemptFailure`, `user-state.ts` `swapUserState`).

On PostgreSQL the retry cannot work: a failed statement aborts the surrounding transaction, so every later statement
fails with `25P02` and the request ends as `AUTH_INTERNAL_ERROR` (HTTP 500). A failing test reproduces it with two
concurrent failed logins on an identifier with no recorded failure:

- the losing request answers 500 instead of 401;
- its failure is not counted, which weakens attempt limiting against brute force;
- concurrent first sign-ins of a user without a state row fail the same way.

Separately, `recordAttemptFailure` drops a failure silently after losing the compare-and-swap three times.

The roles plugin's `ensure` uses the same insert-and-catch pattern on a schema command (`role-ensure.ts`) and may abort
its transaction the same way.

## Decision

1. **`insertIfAbsent`.** The private collection handle gains
   `insertIfAbsent({ data }): Promise<PrivateCollectionRecord | null>`. It inserts the record, or returns `null` when a
   record with the same value on any unique index already exists. It never raises a unique violation and never aborts
   the transaction. The PostgreSQL adapter compiles it to `INSERT … ON CONFLICT DO NOTHING RETURNING …`; every
   private-storage adapter must support it, and the adapter conformance tests cover it.
2. **The auth plugin uses it.** Creating the first attempt record and the first user-state record use `insertIfAbsent`;
   on `null` the loop reads the winner's record and applies its compare-and-swap.
3. **A failure is never dropped.** When recording a failed attempt still loses after its bounded retries, the request
   fails with the retryable `TRANSACTION_CONFLICT` error instead of succeeding without counting it, so contention cannot
   bypass attempt limiting.
4. **Roles `ensure`.** The roles plugin's `ensure` is checked under concurrency on PostgreSQL. If it aborts its
   transaction, it is fixed without catching a unique violation inside the transaction, with the narrowest generic
   means available; a Core schema-command change, if one is needed, gets its own record.

## Consequences

- Tests: the concurrent first-failure test passes; concurrent first sign-ins succeed; `insertIfAbsent` on PostgreSQL and
  the shared memory test database (returns the record, then `null`, without aborting); an attempt that cannot be
  recorded answers `TRANSACTION_CONFLICT`; roles `ensure` under concurrency.
- Plugin authors get a way to create keyed records under concurrency without catching database errors.
- **Documentation impact:** both: the plugin-authoring page that documents private storage, and this record.
