# 6304: Preserve exact schema contracts from source

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`
- Depends on: 6303
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make `App.Schema.define()` retain exact source field and schema contracts across
Core models and operations while keeping the current declaration object shape.

## Starting inventory

- Starting revision: `7b17502b`.
- `Schema.define()` retained exact declaration fields only in Runtime metadata;
  its public class contract was immediately erased to
  `SchemaTypeInfoByNameOrBase<TClassName>`.
- `SchemaTypeInfoFor`, `SchemaTypeValue`, `SchemaAPI`, Query inputs/results,
  model contracts, nested writes, relationships, and update expressions consumed
  that erased generated-or-bootstrap contract.
- Typegen emitted local item/output/create/update/filter/select/include/order and
  nested-write declarations as well as the cross-schema name registry.
- Reusable and specialized schemas both delegated to the same schema compiler,
  but their public source field maps were erased in the same way.

## Acceptance criteria

- [x] `App.Schema.define({ className, fields, indexes, ... })` is the only ordinary schema declaration path and keeps the current syntax.
- [x] `UltimaBase.Schema.define()` is the zero-plugin portable form of that same mechanism; any temporarily retained standalone `Schema` entry delegates the same compiler and is removed by issue 6314.
- [x] Core fields, required/default/generated/immutable state, objects, lists, virtuals, indexes, system fields, and constraints infer from source; pointers, relations, circular targets, nested writes, and relationship filters resolve their literal target names through the sole retained Typegen graph.
- [x] Drafts, persisted models, create/update/upsert inputs, where, order, select, include, nested writes, relation commands, and operation results retain their exact current types.
- [x] Schema declarations stay inert and are registered only through explicit `new App({ schemas })` roots.
- [x] The implementation does not mutate a prior configured factory, exported schema class, or prototype after definition.
- [x] Reusable package schemas and separately compiled inert applications retain exact identity and isolation.
- [x] Compatible root/ancestor schemas compose into configured descendant applications, while incompatible plugin-dependent schemas fail with focused source and Runtime diagnostics.
- [x] Superseded generated schema contracts are deleted only when the proof identifies a source-owned replacement; the name-to-schema graph remains singular and generated.
- [x] Source and packed hover output remains named, concise, and documented.
- [x] Schema examples and public documentation are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Compile-time contracts for every Core field and operation family.
- [x] Circular pointer/relation and cross-module schema fixtures.
- [x] Runtime schema compilation, identity, and explicit-registration regressions.
- [x] Source and packed editor tests against 1, 10, and 50-schema profiles.
- [x] Locked TypeScript performance and memory budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every generated/Core schema contract and reusable/specialized schema consumer before migration.
- [x] Audit the complete diff for lost field/input/result precision, recursive type expansion, circular-target regressions, hidden registration, duplicate compilers, unbounded migration paths, late mutation, stale generated lookups, editor degradation, and documentation/example drift.
- [x] Record each finding and correction in the handoff; rerun affected checks, budgets, and the complete audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not delete a retained editor assertion or generated-path test before equivalent source coverage exists.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Implementation evidence

- `UltimaBase.Schema.define()` and every configured `App.Schema.define()` retain
  the exact Core field map in `SchemaReference`, while the temporarily retained
  standalone `Schema.define()` deliberately keeps its generated-or-bootstrap
  compatibility contract until issue 6314.
- Source-owned type projections cover Core item/output values, create and update
  inputs, nested writes, filters, ordering, selections, inclusions,
  relationships, numeric deltas, drafts, persisted results, and every schema
  command. Existing generated entries remain authoritative only while they may
  still contain unmigrated plugin-owned additions.
- Direct low-level relationship targets carry their exact class without Runtime
  metadata. Ordinary literal-name targets continue through the one generated
  application graph, including circular and cross-module schemas.
- Schema declaration callbacks execute once at definition time, registration
  remains explicit through application roots, and compiling the same class in
  two isolated applications neither reruns the declaration nor mutates the
  class or prototype.
- The locked 1/10/50-schema checkpoint and its comparison with issue 6303 are
  recorded in
  [`evidence/6304-source-schema-benchmark.md`](evidence/6304-source-schema-benchmark.md).

## Audit findings and corrections

| Finding                                                                                                                                                       | Correction                                                                                                                                                                 | Proof                                                                                                                                      |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| Making standalone `Schema.define()` exact immediately hid current Typegen-only plugin fields before the plugin migration issues.                              | Restricted exact source inference to `UltimaBase.Schema` and configured application namespaces; kept the standalone entry on its old contract until its scheduled removal. | The repository typecheck and all 1,376 Core tests pass without weakening existing plugin declarations.                                     |
| Reusing the shared field value map for source pointer writes changed Password Auth's nested pointer semantics.                                                | Restored the shared map and introduced a source-only pointer mutation projection.                                                                                          | Root typecheck covers Password Auth and the Core source contract accepts flat `PointerValue` drafts plus graph-aware nested writes.        |
| The first specialized-schema generic widened package-owned `className` and field maps.                                                                        | Derived the field map directly with `ReturnType<TOptions['fields']>`.                                                                                                      | Roles, Password Auth, and specialized-schema type tests pass with exact statics and result commands.                                       |
| Projecting overloaded `findMany` through an application handle rebound its polymorphic result to the handle.                                                  | Added one focused internal overload rebinding used only by the handle projection.                                                                                          | The handle's `findMany` function is type-equal to the schema command and Core type tests pass.                                             |
| Initial Runtime-test casts were artifacts of the rejected global migration boundary.                                                                          | Removed every unnecessary cast and expectation change rather than preserving migration noise.                                                                              | The reduced diff passes global typecheck and the complete Core suite.                                                                      |
| Existing docs incorrectly said the field callback first runs during application compilation.                                                                  | Documented the real once-at-definition capture, immediate Core-only resolution, deferred configured-plugin resolution, and explicit registration boundary.                 | Package docs, schema examples, and public website sources now describe the same lifecycle.                                                 |
| The locked hybrid benchmark still represents the complete accepted plugin-source target rather than only shipped issue-6304 types.                            | Kept it as the comparable milestone series, added real source and packed Core implementation profiles, and recorded the distinction beside the numbers.                    | The benchmark, circular graph language-service test, and six real 1/10/50 Core profiles pass independently.                                |
| The first complete run exposed one hover assertion that froze `SchemaReference` to one generic parameter, plus local-listener failures caused by the sandbox. | Kept the literal schema identity assertion without freezing migration arity, verified it in isolation, and reran the complete gate with local-network permission.          | The final `yarn validate:full` passes from the beginning with all listener, hover, coverage, constraint, and documentation checks enabled. |

## Validation evidence

- `yarn typecheck`
- `yarn workspace @ultimabase/core test --maxWorkers=1`: 271 files,
  1,376 tests, 142 type tests, zero type errors.
- `yarn workspace @ultimabase/core test:types --maxWorkers=1`: 72 files,
  142 tests, zero type errors.
- Circular cross-module source/Typegen graph language-service test: 1 passed.
- Actual source and packed Core 1/10/50 editor profiles: 6 passed.
- Locked hybrid performance benchmark: passed with zero initial diagnostics and
  one focused edit diagnostic in every sample.
- `yarn validate:full`: passed.
- Complete coverage: 90.91% statements (`23,729/26,099`), 84.49%
  branches (`14,694/17,391`), 96.08% functions (`5,005/5,209`), and
  91.47% lines (`23,017/25,161`); 631 files and 2,871 tests passed with
  zero type errors.
- Issue metadata: 9 tests passed. Public documentation: 17 files and 66 tests
  passed. Dependency constraints completed successfully.

Documentation impact: **both** — the public schema and Typegen behavior changed,
so package engineering docs, schema examples, and the owned public website pages
were reviewed and updated together.

## Out of scope

- Concrete plugin option typing.
- Automatic schema discovery through imports.
- A new schema declaration syntax.
