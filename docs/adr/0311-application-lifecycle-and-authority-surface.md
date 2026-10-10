# ADR-0311: Application lifecycle, explicit transactions and the authority surface

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: the literal-`true` `useMasterKey` rule of ADR-0114, retained by
  ADR-0153; ADR-0094 and ADR-0066 where they place `anonymous` and `withContext` on the public
  application; ADR-0058 where it exposes a public `QueryBuilder` constructor
- Refines: ADR-0258 (lifecycle phases), ADR-0068 (request transactions), ADR-0071 and ADR-0206
  (Master), ADR-0300 (explicit transactions are not retried), ADR-0016 (controlled exports);
  applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/api-ideale-decisions.md`, decisions 7
  and 8; `docs/handoff/revue-plugins/core.md`, decisions 4, 6, 8 and 9); record accepted by the user
  on 2026-10-09

## Context

`start()` resolves to `void` (`packages/core/src/runtime/application/ultima-base.ts`). An
explicit transaction needs `ultimabase.anonymous({ requestId, source }).transaction(...)`
(`apps/website/content/docs/1.0.0/core/writing-data/transactions.mdx`). `useMasterKey` accepts
only `true` (`packages/core/src/query/operations/options.ts`), so a conditional elevation needs
two calls. Application developers see request-context machinery meant for plugins (`anonymous`,
`withContext`, `RequestContext.anonymous`, `RequestContextValue`, `RequestCapability`) and public
`new WhereBuilder(Post)` and `new QueryBuilder(Post)` constructors.

## Decision

1. **Lifecycle.** `start()` resolves to the application itself:
   `await using app = await ultimabase.start()`. Guides document only `start()`, `await using`
   and `dispose()`; `compile()`, `initialize()` and `stop()` remain for advanced cases and keep
   ADR-0258 semantics.
2. **`ultimabase.transaction(fn)`** runs `fn` (no argument) in one adapter transaction and
   resolves to its result. It uses the current request context when called inside one (HTTP
   handler, hook, operation), otherwise a fresh anonymous internal context. Calls inside `fn`
   join the transaction; it is not retried (ADR-0300). Calling it while a transaction is already
   active fails with the existing nested-transaction error (savepoints stay refused).
3. **`useMasterKey: boolean`.** `true` elevates as today; `false` is identical to omitting the
   option: it inherits the current authority and never downgrades a Master context. Any other
   value is rejected before execution. The JSDoc and the Master page state that the value must
   come from server-side state and never from request input (body, query, headers), with
   `{ useMasterKey: isScheduledJob }` as the example. Plugin-initiated elevation still requires
   `authority:elevate`.
4. **Plugin-author export.** A new subpath `@ultimabase/core/plugin` exports `RequestContext`
   (with `RequestContext.anonymous`), `RequestContextValue`, `RequestCapability`,
   `requestSources`, `RequestEngine`, `anonymous(app, options)` and `withContext(app, context)`
   (replacing the instance methods), `authorizeMasterKey(app, rawKey)` for transports, and the
   `WhereBuilder` and `QueryBuilder` classes. The main entry exports `WhereBuilder` and
   `QueryBuilder` as types only: applications receive builders where Core passes them (Access
   and relation `where` callbacks, `QueryScope`). `OperationOptions.context` remains, documented
   for plugin authors. Further plugin-author names move only through their own records.

## Consequences

- Consumers to migrate: HTTP and GraphQL request execution, Access (`new WhereBuilder` in
  `packages/access-plugin/src/runtime/rule-evaluation.ts`), PostgreSQL (`new QueryBuilder` in
  `relation-predicate-compiler.ts`), Password Auth, testing utilities, examples, `create-app`
  templates, website pages `core/application.mdx`, `core/writing-data/transactions.mdx`,
  `core/security-foundations/master-authority.mdx` and `request-identity.mdx`, the PostgreSQL
  README sections using `new QueryBuilder`.
- Tests: `start()` returns the same instance and `await using` disposes it; `transaction` with
  and without an active request, rollback on throw, nested call refused, inherited principal
  (ADR-0304); `useMasterKey: false` inside a Master context keeps Master, non-boolean rejected,
  type test accepting `boolean`; the subpath export map in compiled packages; main entry
  exposes no builder constructor and no context API (export snapshot and DX audit).
- Documentation impact: both (application, transactions, Master, plugin authoring pages).

## Out of scope

Moving the rest of the plugin-authoring API to the subpath, the configuration file and CLI,
replay-safe explicit transactions (ADR-0300 reopening condition), savepoints.
