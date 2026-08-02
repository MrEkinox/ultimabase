# ADR-0099: Automatic transactions for every mutation

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0015, ADR-0068, ADR-0069, ADR-0089
- Extends: ADR-0098

## Context

Explicit `RequestEngine.transaction()` already supplies one adapter-neutral
transaction lifetime, scoped engine, rollback-only tracking, and deferred
post-commit effects. Bulk create and upsert also reuse that lifetime when their
normalized `atomic` option is true. Singular mutations and set-based update or
delete still execute on the root adapter, however, which would let database
work started by future native business hooks survive a later primary-operation
failure.

The native dispatcher must not implement a second transaction mechanism.
Automatic transactions need to exist before issue 330 starts invoking schema,
field, and plugin hooks, while the richer public hook capability object remains
owned by issue 340.

## Decision

### Root mutation boundary

Every root mutation uses the existing `RequestEngine.transaction()` lifecycle:

- `create-one` and `create-many`;
- `update-one` and `update-many`;
- `upsert-one` and `upsert-many`;
- `delete-one` and `delete-many`.

A root mutation is an operation executed by a request engine without an active
transaction lifetime. Runtime begins the adapter transaction, derives the
transaction-bound engine, installs it in the application-owned asynchronous
scope, and executes the complete mutation pipeline through the transaction
adapter. It waits for every nested operation started during that lifetime before
committing once. Any callback, pipeline, adapter, or nested-operation failure
rolls back and discards deferred post-commit effects.

An operation already running inside explicit `RequestEngine.transaction()`
reuses that exact transaction engine and never attempts unsupported nesting.
Reads remain non-transactional at the root and continue to reuse an explicit
transaction when the developer opened one.

Automatic mutations require a valid `DatabaseAdapter` transaction capability.
Runtime fails before executing the mutation when the configured adapter cannot
begin a valid transaction. Master elevation retains the same transaction
lifetime and cannot create a side transaction.

### Bulk grouping does not bypass transactions

ADR-0069 is refined: `{ atomic: false }` no longer means execution on the root
adapter. The `atomic` option may control how a future collection is grouped,
but every resulting group remains inside an adapter transaction. Issue 329
establishes the mandatory transaction floor without selecting partial-success,
stopping, result, or per-item grouping semantics; issue 334 owns those choices.

Until issue 334 introduces a different documented grouping strategy, a bulk
mutation remains one normalized operation and therefore one automatic
transaction. Transports must not interpret `atomic: false` as permission to
bypass Runtime's transaction boundary.

### Hook capability boundary

Issue 329 installs transaction infrastructure but does not execute native
hooks. Issue 330 composes and invokes developer and plugin declarations inside
the already active transaction. Existing contextual access through
`getCurrentEngine()` resolves to the transaction engine throughout the
operation pipeline.

Native hook inputs do not expose a temporary raw `RequestEngine` property.
Issue 340 introduces the explicit immutable `HookContext` capability class and
its transaction-bound `query()` method. Transaction finalization hooks such as
`beforeCommit`, `afterCommit`, and `afterRollback` remain issue 332.

## Consequences

- Application code receives atomic singular and set-based mutations without a
  new option or method.
- The native dispatcher can execute effectful business hooks without opening or
  owning transactions itself.
- Caught nested-operation failures still make the automatic lifetime
  rollback-only.
- Database adapters must support transactions before they can execute
  mutations; ADR-0098 provides that prerequisite for PostgreSQL.
- `atomic: false` remains a collection-grouping declaration and never becomes a
  security or consistency bypass.
- Reads retain their existing performance and transaction visibility unless a
  developer explicitly groups them with mutations.
