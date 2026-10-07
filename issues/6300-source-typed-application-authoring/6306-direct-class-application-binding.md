# 6306: Bind direct class execution to the sole active application

- Status: completed
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

- [x] Native CRUD, plugin schema mutations, package-specialized statics, application-backed User methods, and applicable model commands execute directly from their exact source-typed class or returned model.
- [x] Outside a request, direct calls resolve the sole active application; inside a request they preserve the exact request-local owner and reject conflicts.
- [x] Every call verifies active lifecycle, exact configured-factory and schema ownership, compiled command presence, instance identity, authority, and disposal state before effects.
- [x] Classes and prototypes retain no application resource, adapter, credential, transaction, request context, authority, or mutable last-writer binding.
- [x] Calls before initialization, after disposal, from foreign factories, and through stale models fail closed with actionable errors.
- [x] Concurrent requests, transactions, cancellation, subjects, and Master audit remain request-local.
- [x] Direct class execution and the temporarily retained explicit paths delegate one ownership and Runtime boundary; issue 6314 removes redundant public handles and repeated ordinary `{ ultimabase }` selection after every consumer migrates.
- [x] Sequential replacement and isolated-worker behavior retain ADR-0258 guarantees.
- [x] Documentation impact is recorded.

## Starting inventory

- Starting revision: `d6ae7f1a`.
- Explicit application selection enters through `OperationOptions.ultimabase`
  and is normalized once in `query/operations/execution.ts`. The starting tree
  contained 648 package references matching an `ultimabase:` property; these
  include declarations, fixtures, transports, and advanced paths assigned to
  later consumer migrations and issue 6314, not 648 independent executors.
- Ambient request ownership enters through the single
  `active-framework-context` storage and `runWithRequestEngine` boundary (143
  package references). `getCurrentUltimaBase()` had 25 consumers and resolved
  request ownership only.
- Application schema handles are created in `application-handles.ts` and
  exposed by `UltimaBase.schema()` (56 package call sites). They already
  delegated native and plugin mutations to the same Runtime; they are retained
  temporarily for advanced and unmigrated consumers.
- Native class commands converge in `query/operations/execution.ts`; plugin
  class mutations converge in the same owner registry. Immutable model commands
  live in `schema/model-commands.ts`, relation commands in
  `schema/relations/relation.ts`, and plugin model mutations in
  `application-model-views.ts`.
- Requests originate from `UltimaBase.anonymous()`, `UltimaBase.master()`, or an
  existing request-local engine. Master intent enters only through the 245
  package `useMasterKey` references and remains normalized and audited by the
  selected application engine.
- The migration therefore extends the existing lifecycle slot and execution
  owner registry. It introduces no default-application registry, second Runtime
  dispatcher, class mutation, prototype mutation, or ambient authority store.

## Tests

- [x] Native and plugin direct command parity.
- [x] Lifecycle, stale object, foreign schema, replacement, and concurrent request regressions.
- [x] Master-only, transaction, cancellation, Access, Hooks, and error parity.
- [x] Source and packed direct-surface editor contracts.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every explicit/ambient application-selection, schema-handle, class-command, model-command, request, and Master consumer.
- [x] Audit the complete diff for implicit foreign ownership, stale rebinding, authority manufacture, transaction/context leakage, lifecycle resurrection, prototype mutation, lost advanced capability, duplicated execution internals, unbounded migration paths, error drift, and editor/documentation regressions.
- [x] Record each finding and correction in the handoff; rerun affected security/lifecycle/concurrency checks and the complete audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not classify a race or security failure as flaky without a proven cause and successful rerun.
- [x] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Implementation evidence

- Native schema commands, plugin schema mutations, plugin model mutations, and
  application-backed Password User statics now select the sole initialized
  application outside a request. An active request always takes precedence and
  an explicit conflicting owner remains rejected.
- The existing lifecycle slot and query-owner registry are reused. Each
  application registration creates one opaque symbol token; returned models
  retain only that inert token and their installed command names, never an
  application, engine, adapter, authority, credential, or request context.
- Every direct invocation re-resolves the current owner and compares its token
  before effects. Models, relations, nested models, application-operation
  results, and Password User results therefore reject stale or foreign use
  after sequential application replacement.
- Result binding recursively preserves model identity semantics without
  mutating source classes or prototypes. Non-model records and arrays retain
  identity; records containing models preserve their own descriptors, symbols,
  prototype, and extensibility state in an immutable application-bound view.
- The explicit `{ ultimabase }` and application-schema-handle forms still
  delegate the same Runtime boundary during the bounded migration window.
  Their removal remains exclusively assigned to issue 6314.
- Source and packed language-service fixtures protect direct `Post.findMany()`
  and returned-model command inference. The locked raw 1/10/50-schema samples,
  baseline comparison, and issue-6305 evolution are recorded in
  [`evidence/6306-direct-execution-benchmark.md`](evidence/6306-direct-execution-benchmark.md).

## Audit findings and corrections

| Finding                                                                                                                                                       | Correction                                                                                                                                               | Proof                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| A stale model initially lost its plugin method after sequential replacement, so it failed by missing property rather than the ownership boundary.             | Snapshot only the installed inert command names on result binding; the method remains present and checks the opaque lifecycle token before every effect. | Replacement and stale plugin-model regressions pass.                                                         |
| Application-operation records such as Password Auth `{ user, session }` initially left nested models unbound.                                                 | Added recursive array/plain-record result binding while retaining untouched value identity.                                                              | Direct Password signup/login/refresh/logout PostgreSQL coverage and nested-result unit tests pass.           |
| The first recursive binder cloned every record and did not preserve symbol, non-enumerable, prototype, or extensibility semantics.                            | Clone only result containers whose descendants change, and copy every own property descriptor plus prototype and extensibility state.                    | Dedicated descriptor, symbol, prototype, frozen-record, collection-cache, and unchanged-identity tests pass. |
| Proxying a frozen Runtime model directly violated JavaScript invariants for non-configurable selected fields and caused PostgreSQL relation/pointer failures. | Build an immutable descriptor-preserving target before proxying, while aliasing it to the same trusted model state.                                      | The affected PostgreSQL relation/pointer suites pass, followed by the complete coverage gate.                |
| One sandbox run could not open local Hono/Yoga listeners.                                                                                                     | Proved the environment cause by rerunning the unchanged listener suites with local-listener permission.                                                  | Four listener files and 20 tests pass without a source workaround.                                           |
| One complete run missed the language-service initialization budget by 0.149 ms while all other samples and the isolated three-sample benchmark passed.        | Kept the threshold unchanged and reran the complete contract; the mathematical three-process median passed.                                              | Final `yarn validate:full` and the saved checkpoint pass all locked budgets.                                 |

## Current validation evidence

- Focused native/plugin execution, lifecycle, replacement, foreign-schema,
  result-binding, request-context, source/packed editor, and Password User
  suites pass. Targeted PostgreSQL Password Auth passed 7 tests; relation and
  pointer regressions passed 3 files and 22 tests; listener regressions passed
  4 files and 20 tests.
- At 50 schemas, the hybrid checkpoint is 49.6% faster for cold checking,
  64.9% faster after an edit, 78.3% smaller in generated declarations, 56.0%
  lower in peak TypeScript heap, and 10.9% faster to initialize the language
  service than the original issue-6301 current-form baseline. Against issue
  6305, cold checking changed by +0.1%, edit diagnostics by -0.3%, language
  service initialization by -4.6%, generation by +0.3%, and heap by +0.3%.
- The touched handwritten production files remain under 600 lines and test
  files under 700 lines. Query option normalization and public application
  contracts were extracted as cohesive modules rather than hidden behind file
  budget exceptions.
- Complete issue diff at handoff: 35 files, +1,235/-566 lines; production
  +681/-262, tests +225/-88, documentation and issue evidence +329/-216. The
  temporary net increase is the direct-result ownership foundation; issue 6314
  remains responsible for deleting the superseded explicit execution paths.
- `yarn validate:full`: passed from formatting through public documentation.
  Ordinary validation passed 556 files and 2,622 tests. Complete coverage
  passed 634 files and 2,879 tests with zero type errors: 90.84% statements
  (`23,851/26,256`), 84.34% branches (`14,746/17,483`), 96.01% functions
  (`5,014/5,222`), and 91.41% lines (`23,128/25,301`). Issue metadata passed
  9 tests, public documentation passed 17 files and 66 tests, and dependency
  constraints completed successfully.

Documentation impact: **both** — ordinary direct execution changes public
examples and lifecycle guidance, while the internal query/Runtime ownership
contract and migration handoff also changed. Root, Core, Password Auth, Soft
Delete, query-runtime, and owned website documentation were reviewed and
updated together.

## Out of scope

- Mutable Active Record or dirty tracking.
- More than one initialized application per JavaScript realm.
- Giving transports or plugins the application facade.
