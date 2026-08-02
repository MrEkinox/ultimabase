# 340: Add the HookContext capability class

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 329, 330, 332, 333
- ADR: ADR-0062, ADR-0065, ADR-0068, ADR-0089, ADR-0107

## Goal

Give native and plugin hooks one immutable `HookContext` class that exposes only
transaction-bound framework capabilities while retaining `RequestContext` as
the authority and request-identity object.

## Target developer experience

```ts
beforeCreate(async ({ context, input }) => {
	await context.query(AuditSchema).create({ action: 'post.create' })
	context.emit('post.creating', { title: input.title })
})
```

## Acceptance criteria

- [x] Runtime alone constructs `HookContext` from the current `RequestContext`, engine, transaction, hook identity, and cancellation signal.
- [x] `context.query(schema)` always reuses the current operation transaction and application ownership boundary.
- [x] `context.emit(name, payload)` queues an external event for post-commit delivery and discards it on rollback.
- [x] Request mode, authenticated identity, source, request ID, transaction ID, hook identity, and `AbortSignal` are available as immutable read-only state.
- [x] No raw master key, database adapter, mutable pipeline stage, hook bypass, or transaction commit primitive is exposed.
- [x] Escaped contexts and queries fail after their operation or transaction lifecycle closes.
- [x] `HookContext` composes rather than replaces `RequestContext`; it cannot manufacture or broaden authority.
- [x] Native schema hooks, inline field hooks, and plugin hooks receive the same capability class with target-specific generic typing.
- [x] Public methods and properties provide concise English JSDoc, autocomplete, and compact hovers.

## Tests

- [x] Runtime tests cover nested queries, rollback, post-commit events, cancellation, escaped usage, and cross-application rejection.
- [x] Compile-time tests prove exact query typing and the absence of forbidden credentials or lifecycle controls.
- [x] Language-service and packed-package tests verify autocomplete and readable QuickInfo.
- [x] PostgreSQL E2E tests prove hook writes share the primary mutation transaction.

## Out of scope

- A second authority model beside `RequestContext`.
- Direct database or transport access.
- Skipping hooks or committing a transaction from inside a hook.
