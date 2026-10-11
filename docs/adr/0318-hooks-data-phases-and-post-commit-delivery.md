# ADR-0318: Hooks on plain data, post-commit delivery and bounded recursion

- Status: accepted
- Date: 2026-10-11
- Refines: ADR-0300 (replayable transactional hooks), ADR-0304 (`context.principal`), ADR-0305
  (`PublicError`, post-commit logging), ADR-0310 (plain data results), ADR-0316 (rules in
  `.with`); applies ADR-0288
- Approval: decisions of the Hooks review (`docs/handoff/revue-plugins/hooks.md`, decisions 1 to
  16, validated by the user on 2026-10-09); record accepted by the user on 2026-10-11
- Already implemented elsewhere: `context.principal` (ADR-0304), `PublicError` (ADR-0305),
  automatic transaction retries (ADR-0300)

## Context

Hooks follow KeystoneJS phases (`resolveInput`, `validateInput`, `beforeOperation`,
`afterOperation`) per schema and per field. Today `resolveInput` works on Core's internal
operation tree, items carry model methods, event consumers run awaited on the request path and
their failure rejects a call whose write is already committed, the recursion guard blocks a
legitimate cascade (a Todo updating its parent Todo), and relation link changes made through a
join table are invisible to hooks.

## Decision

1. **`resolveInput` on data.** It receives and returns readable data:
   `create({ data })`, `update({ changes, originalItem })` (only what changes) and
   `upsert({ mode, data, changes })`; Core translates the result back into operations. Atomic
   operations (`{ increment }`, `connect`, `disconnect`, `set`) stay operations in readable
   form and are never rewritten into values. Plugins keep access to the internal tree through
   `provideHookContributions`.
2. **Items are data.** `item` and `originalItem` are `Model<"Todo">` values without methods;
   acting on other rows uses the normal API, which inherits the transaction and the authority.
3. **Relation changes are visible.** `changes.tags` shows link changes as
   `{ connect: [...], disconnect: [...] }` (a `set` is turned into that difference), join-table
   relations included.
4. **Phases.** `beforeOperation.upsert` (with `mode`) is added. A key `all` exists for
   `resolveInput`, `beforeOperation`, `afterOperation` and `afterCommit`, and runs before the
   operation's own hook. Field hooks receive the value alone and run only for a non-null value.
   There are no read hooks and no option to skip hooks; Master bypasses authorization, never
   hooks.
5. **`afterCommit`.** A schema hook phase that runs after a successful commit, outside the
   transaction: sequentially in the order global → `all` → operation; a bulk call runs one
   `afterCommit` per row after the whole transaction commits; the client response does not
   wait for it; an error is logged and never rejects the call or stops the next hooks; delivery
   is best effort within the process. `@ultimabase/testing` gets a helper that awaits pending
   post-commit work.
6. **Typed events with the same guarantee.** `defineEvent<TPayload>('todo.created')`,
   `context.emit(todoCreated, payload)` inside a transaction, consumers declared by the
   application with `hooksPlugin({ events: [onEvent(todoCreated, handler)] })` and bound by
   value. Events are delivered after commit like `afterCommit` (best effort, at most once,
   in-process, not awaited by the response, failures logged); a consumer may use the normal API
   in its own context. Durable delivery (an outbox written in the transaction, retries, at least
   once) is left to a future queue plugin.
7. **Global hooks.** `hooksPlugin({ global: { … } })` declares the same phases and `all` for
   every schema, with a generic `item` and the `schema` name.
8. **Bounded recursion.** The per-hook identity guard is replaced by a depth limit of 16 nested
   hook-issued operations; exceeding it fails with `RUNTIME_CALLBACK_RECURSION`, rolls back,
   and the message shows the chain of schemas and operations.

## Consequences

- Hooks move to `.with({ hooks })` in form D; the old-form `hooks` option follows the same types
  until 6.8. Documentation states that transactional hooks may replay (ADR-0300) and that
  external effects belong in `afterCommit` or events.
- Tests: each phase on data, readable atomic operations, relation `changes` through pointers and
  join tables, `all` ordering, field hooks on null, `afterCommit` order, bulk and failure
  logging, response not awaiting post-commit work, events (typing, delivery after commit,
  consumer failure logged, no consumer), global hooks, depth limit with the chain message and
  the legitimate parent cascade; DX audit and form D bench.
- Documentation impact: both (Hooks pages and README, events, transactions).

## Out of scope

Durable event delivery, read hooks, hook skipping.
