# 6303: Introduce the immutable configured application factory

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`
- Depends on: 6302
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Introduce chained `UltimaBase.use(plugin())` as the immutable canonical plugin
installation path and let the resulting configured class own ordinary
construction, compilation, lifecycle, and schema authoring without duplicating
the internal plugin graph during the bounded repository migration.

## Acceptance criteria

- [x] Every `.use()` returns a new precisely typed configured application factory without mutating its parent.
- [x] `UltimaBase` is the zero-plugin root factory and every configured application is an immutable descendant using the same construction and schema-authoring machinery.
- [x] `new App({ schemas })` preserves all current application options that are not plugin installation.
- [x] Plugin order, dependencies, peers, exact instances, privileges, claims, capabilities, setup exports, resources, diagnostics, and teardown retain their current semantics.
- [x] Several inert configured factories may coexist while only one application may initialize per JavaScript realm.
- [x] A compatible descendant may consume schemas declared by its root or ancestor factory without rebuilding or mutating their class identity; an incompatible factory fails precisely.
- [x] During the bounded migration only, the old `plugins` constructor option and the configured factory feed one normalization, graph, privilege, compilation, and lifecycle implementation; no adapter graph or duplicated state is introduced.
- [x] The old constructor form is not taught as an alternative and its complete removal is explicitly owned by issue 6314 after every consumer migrates.
- [x] Plugins remain one flat application graph; `.use()` never nests lifecycle or hides dependencies.
- [x] Pure `compile()`, setup-only `initialize()`, `start()`, `stop()`, disposal, inspection, and plugin-export lookup remain available through the configured application.
- [x] Source and packed hovers keep the accumulated plugin tuple concise and documented.
- [x] Documentation impact is recorded.

## Tests

- [x] Builder immutability, ordering, duplicate and explicit-instance behavior.
- [x] Privilege denial before static or Runtime effects.
- [x] Lifecycle and sequential replacement regressions.
- [x] Source and packed-package editor contracts.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and recheck every current application/plugin installation consumer before removal.
- [x] Audit the complete diff for mutation, duplicate installation internals, nested graphs, changed order/identity/privileges, lifecycle leaks, unbounded migration branches, type expansion, documentation drift, and unrelated scope.
- [x] Record each finding and correction in the handoff; rerun affected checks and the complete audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not add a compatibility adapter or weaken a test to continue.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Schema source inference, delivered by 6304.
- Plugin type projections, delivered by 6305.
- A mutable application builder or plugin collection object.

## Starting evidence

- Starting revision: `9878f191`.
- The initial migration inventory found 253 files constructing `UltimaBase` and
  322 files containing a constructor plugin list. Issues 6304-6315 own their
  staged migration; issue 6314 owns removal of the temporary constructor input.
- Issue 6302 and ADR-0279 were completed and committed before implementation.
- Unavailable prerequisites at start: none.

## Implementation evidence

- `UltimaBase.use(plugin)` creates one frozen descendant factory and appends the
  exact definition to an immutable tuple stored outside the public class. The
  factory does not compile, initialize, or duplicate an application graph.
- Construction resolves either the configured tuple or the temporary root
  constructor tuple, then enters the existing `FrameworkApplication` exactly
  once. Plugin normalization, graph validation, privileges, declarations,
  capabilities, setup, lifecycle, Runtime, and teardown are unchanged.
- The configured constructor exposes every non-installation instance option but
  no `plugins` property. The migration constructor still requires `plugins`
  whenever its explicit plugin tuple is non-empty, preventing a typed facade
  from claiming plugins that were not installed.
- Runtime and type tests cover immutable accumulation, the zero-plugin root,
  schema identity reuse, ordering, dependencies, duplicate identities, exact
  instances, privilege denial before effects, the one-active-application slot,
  sequential replacement, and rejection of a second installation input.
- The source and packed-package language-service fixtures keep the factory,
  `.use()`, `Schema`, lifecycle, and plugin-export hovers concise and documented.
- The complete 1/10/50-schema checkpoint and comparison with the original and
  preceding measurement are recorded in
  [`evidence/6303-configured-factory-benchmark.md`](./evidence/6303-configured-factory-benchmark.md).

## Validation evidence

- `yarn validate:full` passed after the final benchmark correction: formatting,
  typecheck, 552 ordinary files/2,611 tests, lint with zero errors, every package
  build, `attw`, `publint`, 628 coverage files/2,860 tests, issue metadata,
  dependency constraints, and 17 public-documentation files/66 tests.
- Complete coverage is 90.91% statements (23,729/26,099), 84.49% branches
  (14,694/17,391), 96.08% functions (5,005/5,209), and 91.47% lines
  (23,017/25,161). No check was skipped or unavailable.
- The configured-factory implementation adds no second compiler, normalized
  graph, application owner, lifecycle host, schema registry, or Runtime path.
  One immutable tuple is resolved immediately before the existing
  `FrameworkApplication` constructor.
- The complete staged diff is 67 files, +1,062/-354 lines: production code
  +144/-17, tests and editor fixtures +418/-14, and documentation, issue,
  evidence, and planning files +500/-323. The production delta is +127 net
  lines; most added volume is regression evidence and migration of the public
  examples rather than a second implementation.

## Documentation impact

Classification: **both**. The public plugin installation API changed, so the
root and package READMEs, active engineering concepts and examples, the public
website application/plugin guides, official plugin examples, and documentation
plan now teach only the immutable `.use()` chain. Historical ADRs and completed
plans retain their original syntax. Existing source consumers remain on the
bounded migration path and are removed only by issues 6314-6315.

## Audit iterations

| Iteration | Finding or evidence                                                                                                                                                                                                                                               | Correction or decision                                                                                                                                                                                                                    | Validation result                                                                                                                                                        | Remaining findings                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1         | The first duplicate test used the exact same frozen definition twice, which Core intentionally deduplicates; the configured-factory lifecycle test also did not yet exercise the realm ownership boundary its title claimed.                                      | Used two distinct definitions with the same structured identity for conflict coverage, then added inert coexistence, concurrent activation rejection, disposal, and sequential replacement through the configured factory.                | Focused Runtime suite passes 5 tests; lifecycle order and absence of effects before ownership are explicit.                                                              | Audit the public type boundary and packed editor surface.                        |
| 2         | Making the migration `plugins` property simply optional allowed an explicitly non-empty `TPlugins` argument to claim plugin exports without installing the tuple. A first conditional type also distributed over tuple unions used by existing diagnostics tests. | Made the root option optional only for the exact empty tuple and required it otherwise, using a non-distributive conditional; added a negative type regression.                                                                           | Core typecheck and focused Runtime/type suite pass with no type errors.                                                                                                  | Run packed editor, performance, documentation, and complete validation gates.    |
| 3         | Focused lint found deprecated self-access, an unnecessary type argument, and an unbound fixture method. Public website validation then found its documentation-plan outcome still named the removed plugin list.                                                  | Read the legacy option through the validated unknown boundary, simplified the type assertion, invoked the fixture method, and migrated the documentation-plan source with the page. No lint rule or documentation assertion was weakened. | Focused lint has only the pre-existing 400-line warning below the 600-line hard limit; packed source/build fixture and all 17 website files/66 tests pass.               | Complete performance and repository validation, then repeat the full diff audit. |
| 4         | Two longer repository runs exposed an order-sensitive language-service measurement: current always ran before hybrid, so transient startup or host-load drift could systematically penalize hybrid.                                                               | Counterbalanced process order across the same two isolated samples. No fixture, sample count, threshold, or asserted editor capability changed.                                                                                           | The counterbalanced suite passes. At 50 schemas hybrid remains 51.0% faster cold, 64.4% faster after edits, 78.3% smaller in declarations, and 57.1% lower in peak heap. | Run `yarn validate:full` and the final zero-finding audit.                       |
| 5         | The final consumer, export, documentation, line-budget, lifecycle, graph-identity, and complete-diff audit found no remaining issue-6303 defect or unrelated implementation.                                                                                      | No product correction required. Kept source-consumer migration bounded to later issues and retained the constructor path only as the explicitly scheduled migration bridge.                                                               | `yarn validate:full`, `git diff --check`, active-documentation legacy-syntax search, public package checks, and every locked performance budget pass.                    | None.                                                                            |
