# ADR-0300: Retry automatic mutation transactions on transient conflicts

- Status: proposed
- Date: 2026-10-09
- Refines: ADR-0042 (`retryable` flag), ADR-0164 (atomic item-oriented mutations), the Runtime
  order of `docs/engineering/agent-domain-rules.md`; applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/adaptateurs.md`, point 2, and the transversal rules of
  `docs/handoff/revue-plugins/README.md`); awaiting validation of this record
- Evidence: `docs/handoff/audit-adaptateurs-base.md`, section 3 (`main` 116cf14e)

## Context

Core never retries: `retryable` is only a payload flag (`packages/core/src/errors/framework-error.ts`)
and `runRequestTransaction` commits once (`packages/core/src/runtime/transactions/run-transaction.ts`).
PostgreSQL flags serialization failures and deadlocks (40001, 40P01) as retryable but reports them
as `INTERNAL_ERROR` (`packages/postgres-plugin/src/drizzle/operation-error.ts`). MongoDB has no read
locks and aborts any conflicting transaction with `TransientTransactionError`; under contention each
abort would become a client error.

## Decision

1. **Classification belongs to the adapter.** A failure is transient only when the adapter
   guarantees that the transaction rolled back, nothing persisted, and a re-run may succeed:
   PostgreSQL 40001 and 40P01, MongoDB errors labelled `TransientTransactionError`. The adapter
   reports `TRANSACTION_CONFLICT` with `retryable: true` (ADR-0302). An unknown commit outcome is
   never transient for Core; an adapter may resolve it itself only when its commit is idempotent.
2. **Core retries automatic mutation transactions**: the transaction Core opens for one schema
   mutation, collection command, nested write graph or plugin mutation. At most 3 attempts in
   total, with a short randomized backoff. Each attempt replays the operation from normalization:
   Access, `resolveInput`, before and after hooks, nested writes; generated identifiers and
   timestamps are regenerated. Post-commit effects (`afterCommit`, events) of failed attempts are
   discarded; those of the committed attempt are delivered once. No attempt starts after
   cancellation (`signal`) or past the request deadline. After the last attempt the caller receives
   `TRANSACTION_CONFLICT` with `retryable: true`.
3. **Replay rule.** Every callback running inside the transaction (Access functions and policy
   predicates, hooks other than `afterCommit`, ACL `resolveInput`, virtual fields computed for the
   mutation, plugin hook contributions) may run several times for one call and must have no effect
   outside the transaction: no HTTP call, e-mail, queue message, file or surviving in-memory state.
   Writes through the UltimaBase API are allowed (they join the transaction). External effects go
   to `afterCommit` or events, best effort after commit.
4. **Explicit `ultimabase.transaction(fn)` is not retried.** Core neither controls nor sees the
   callback, which mixes reads with application logic; replaying it silently would replay effects
   the developer never declared safe. The caller receives `TRANSACTION_CONFLICT` with
   `retryable: true`, and the guide shows a retry loop. Operations inside an explicit transaction
   join it and are never retried on their own. Reopening condition: a real consumer that needs
   replay, through an opt-in declaring the callback replay-safe.
5. Each retry is logged at debug level (operation, schema, attempt, code; never values);
   exhaustion is logged as a warning.

## Consequences

- PostgreSQL maps 40001 and 40P01 to `TRANSACTION_CONFLICT`. The Hooks JSDoc and website state the
  replay rule; official plugins' transactional callbacks are checked for external effects when they
  migrate.
- Tests: a fake adapter failing N attempts then succeeding (hooks counted, `afterCommit` delivered
  once), exhaustion, non-transient errors not retried, cancellation stops retrying, explicit
  transactions not retried, a PostgreSQL deadlock between two concurrent updates resolved.
- Documentation impact: both (Hooks and transactions guides, Core and PostgreSQL READMEs).

## Out of scope

Reads outside a transaction, connection retries at startup (PostgreSQL review, decision 9),
savepoints and nested transactions (still refused), a durable outbox (future queue plugin), a
configurable attempt count (added when a consumer needs it).
