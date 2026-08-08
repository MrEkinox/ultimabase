# ADR-0107: HookContext capabilities and named events

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0062, ADR-0068, ADR-0070, ADR-0089, ADR-0105, ADR-0106
- Refined by: ADR-0108, ADR-0113, ADR-0172

## Context

Hooks need to start typed framework operations without receiving a raw
`RequestEngine`, adapter, transaction finalizer, credential, or bypass control.
Those nested operations must reuse the originating application, request
authority, and transaction. A retained context or query must also become
unusable as soon as its hook callback finishes, including when the developer
did not await a nested operation.

Hooks also need a small business-event primitive. The existing low-level
`postCommitEvent` observes completed operations, but it does not let a hook emit
one explicit named JSON payload. Delivering such a payload before commit could
expose work that later rolls back, while silently dropping an event with no
consumer would hide configuration mistakes.

## Decision

### Runtime-owned capability class

Every native schema hook, inline field hook, low-level plugin hook, and generic
enforcement hook receives the same immutable `HookContext` class. It implements
the durable `HookExecutionContext` correlation interface from ADR-0106 and adds:

- immutable request access, source, request identifier, transaction identifier,
  cancellation signal, and static hook identity;
- `hasCapability(token)` using identity-based request capability tokens;
- `query(schema)` for exact typed framework operations;
- `emit(name, payload)` for transaction-bound named events.

Runtime alone can construct a working instance. A private construction key
protects JavaScript callers in addition to the private TypeScript constructor,
and revocable behavior stays in module-owned weak storage. The class composes
the existing trusted `RequestContext`; it does not create, cache, or broaden
authority. Request metadata, raw master keys, master elevation, adapters,
transaction controls, hook stacks, and bypasses are absent.

### Revocable nested queries

Runtime captures the exact active `RequestEngine` when it constructs an
operation hook context. `context.query(schema)` first verifies that the schema
belongs to that engine's exact application, then binds the query to a minimal
executor exposing only operation execution. It never exposes the underlying
request engine.

The executor uses a per-invocation lease. Runtime rejects a context used after
its callback with `HOOK_CONTEXT_CLOSED`, and the same check runs at every
terminal of a query captured while the hook was active. Runtime tracks every
started nested operation, waits for unawaited work before the hook settles, and
retains its first failure so catching a nested rejection cannot make the outer
transaction committable.

Finalization phases are explicitly non-queryable, independently of the current
asynchronous engine scope. This includes `beforeCommit`, `afterCommit`,
`afterRollback`, `onError`, low-level post-commit observers, and named-event
consumers. `beforeCommit` runs after the transaction operation journal closes;
later phases run after commit or rollback. Reopening database work in those
phases would violate transaction ordering.

### Transaction-bound named events

`context.emit(name, payload)` accepts one non-empty event name and a JSON
document root. Runtime snapshots and deeply freezes that object or array at the
call boundary. Emission requires both an active transaction and at least one
matching `onEvent({ name, handler })` plugin contribution. Missing consumers
fail immediately instead of silently losing business intent.

The event is appended to the exact outer transaction's post-commit queue.
Rollback clears it. After a successful commit, matching consumers run
sequentially in plugin graph and contribution order. They receive the detached
payload, request and transaction correlation, emitting hook identity, and a
non-queryable `HookContext`. An event consumer cannot recursively enqueue an
event while the post-commit queue is flushing.

`beforeCommit` and `afterCommit` may emit because both execute before the
post-commit queue begins flushing. Root read hooks may emit only when the read
is already inside an explicit transaction. Rollback and error observers cannot
emit because their transaction can no longer commit.

A failed committed consumer cannot suppress independent sibling consumers.
Runtime reports one failure directly or several through `AggregateError`, then
uses the ordinary committed `onError` path. It never attempts rollback after a
successful commit. The older operation-oriented `postCommitEvent` factory
remains available beside named events.

## Consequences

- Hook code uses the same compact typed Query DX as request code while retaining
  one application and transaction boundary.
- Escaped contexts and queries fail deterministically instead of acquiring a
  later ambient request.
- Unawaited or caught nested failures cannot produce a partial commit.
- Event payloads are portable, detached, and delivered only after commit.
- Missing consumers become visible configuration failures, so intentionally
  optional delivery must be modeled by an installed consumer.
- Finalization hooks cannot perform database queries; durable transactional
  dispatch that requires database state should use a write performed during an
  operation hook, such as a future outbox plugin.
