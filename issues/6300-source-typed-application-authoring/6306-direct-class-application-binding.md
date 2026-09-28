# 6306: Bind direct class execution to the sole active application

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`, direct command consumers
- Depends on: 6305
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make exact schema classes and application-bound immutable results the ordinary
execution surface by resolving the sole active application without repeating
an explicit application argument or public schema handle.

## Acceptance criteria

- [ ] Native CRUD, plugin schema mutations, package-specialized statics, application-backed User methods, and applicable model commands execute directly from their exact source-typed class or returned model.
- [ ] Outside a request, direct calls resolve the sole active application; inside a request they preserve the exact request-local owner and reject conflicts.
- [ ] Every call verifies active lifecycle, exact configured-factory and schema ownership, compiled command presence, instance identity, authority, and disposal state before effects.
- [ ] Classes and prototypes retain no application resource, adapter, credential, transaction, request context, authority, or mutable last-writer binding.
- [ ] Calls before initialization, after disposal, from foreign factories, and through stale models fail closed with actionable errors.
- [ ] Concurrent requests, transactions, cancellation, subjects, and Master audit remain request-local.
- [ ] Direct class execution and the temporarily retained explicit paths delegate one ownership and Runtime boundary; issue 6314 removes redundant public handles and repeated ordinary `{ ultimabase }` selection after every consumer migrates.
- [ ] Sequential replacement and isolated-worker behavior retain ADR-0258 guarantees.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Native and plugin direct command parity.
- [ ] Lifecycle, stale object, foreign schema, replacement, and concurrent request regressions.
- [ ] Master-only, transaction, cancellation, Access, Hooks, and error parity.
- [ ] Source and packed direct-surface editor contracts.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every explicit/ambient application-selection, schema-handle, class-command, model-command, request, and Master consumer.
- [ ] Audit the complete diff for implicit foreign ownership, stale rebinding, authority manufacture, transaction/context leakage, lifecycle resurrection, prototype mutation, lost advanced capability, duplicated execution internals, unbounded migration paths, error drift, and editor/documentation regressions.
- [ ] Record each finding and correction in the handoff; rerun affected security/lifecycle/concurrency checks and the complete audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not classify a race or security failure as flaky without a proven cause and successful rerun.
- [ ] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Mutable Active Record or dirty tracking.
- More than one initialized application per JavaScript realm.
- Giving transports or plugins the application facade.
