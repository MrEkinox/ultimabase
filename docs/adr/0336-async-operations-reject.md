# ADR-0336: Asynchronous operations report failures through their promise

- Status: accepted
- Date: 2026-10-14
- Refines: ADR-0301 (Prisma-like queries), ADR-0297 (named types); applies ADR-0288
- Approval: the verified Core documentation (ADR-0330) found the gaps on 2026-10-14; record accepted by the user on 2026-10-14

## Context

The schema statics (`findMany`, `findOne`, `count`, `exists`, and every create, update, upsert
and delete command) are plain functions. They normalize their input and select the started
application before any promise exists. A malformed input therefore throws from the call itself:
a bad UUID, a `matches` lookaround, a missing execution context, or bad options.
`UltimaBase.start()` on a stopped application, `transaction()`, `can()` with malformed options,
`stop()` and `dispose()` called inside application work, `RequestEngine.transaction()` and the
transport request executor behave the same way. Code comments describe this as intended
("shape errors of the command stay synchronous"), but no record decided it. Callers that use
`.catch()`, `expect(…).rejects` or a promise chain miss these failures.

The mutation result types also disagree with Runtime. With `include` and no `select`,
`createOne`, `createMany` and `updateOne` are typed `{ id; …includes }`, while Runtime returns
every default field plus the includes, exactly like the matching read.
`PluginSchemaMutationResult` has the same gap.

## Decision

1. Every asynchronous public operation reports every failure by rejecting its returned promise
   and never throws from the call. This covers the schema statics, `transaction()`, `can()`,
   `start()`, `stop()`, `dispose()`, `RequestEngine.transaction()` and the transport request
   executor. Error classes, codes and messages do not change. Concurrent `start()` calls still
   share one promise.
2. A mutation result with `include` is typed like the read with the same projection: the
   default fields plus the includes when there is no `select`. `updateMany` and `deleteMany`
   keep their runtime default of `{ id }` plus the includes. Plugin schema mutations follow the
   same rule.

## Consequences

- Code that caught these errors with a synchronous `try` around an un-awaited call must await
  the call. An `await` inside `try` and `.rejects` both work.
- Tests: every entry point is checked with a malformed input. The call does not throw, it
  returns a promise, and the promise rejects with the same error as before. Type tests compare
  each command with the matching `find*` for include only, select only, both and neither. Tests
  that asserted the synchronous throw now assert the rejection.
- The Reading Data pages and the Core README say that a read never throws from the call. Mutation
  result hovers show the default fields when `include` is used without `select`.
- Documentation impact: both.
