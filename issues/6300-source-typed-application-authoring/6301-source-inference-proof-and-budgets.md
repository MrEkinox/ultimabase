# 6301: Prove source inference and lock DX budgets

- Status: completed
- Milestone: 63
- Packages: repository tooling, `@ultimabase/core`, representative plugins
- Depends on: none
- ADR: none; evidence for ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Prove the complete approved authoring shape on the supported TypeScript version
before production migration and lock reproducible editor, compiler, memory, and
complexity budgets against the current Typegen form.

## Acceptance criteria

- [x] Disposable fixtures implement the exact target syntax from the milestone DX contract without changing production exports.
- [x] Minimal, representative, and stress profiles contain 1, 10, and 50 schemas with Core fields, objects, pointers, relations, nested writes, Access, Hooks, validation, the logical vector field contract, Soft Delete, Password User, Roles, and plugin operations.
- [x] The proof infers plugin-added fields, options, schema mutations, model commands, application operations, specialized schemas, and direct class methods directly from installed plugin definitions; exact fields, inputs, results, Access items and filters, Hook inputs, pointers, relations, and nested writes use the retained Typegen graph only when cross-schema name resolution is required.
- [x] Source and packed-package language services verify positive completions, concise documented hovers, signatures, and focused negative diagnostics.
- [x] Repeated isolated measurements record Typegen regeneration, complete edit-to-diagnostic latency, cold typecheck, language-service initialization, warm completion/hover/diagnostic latency, declaration size, and peak heap for old and proposed forms.
- [x] Exact budgets are written before production migration and are no weaker than the default ceilings in the DX contract unless the user explicitly approves an evidence-backed exception.
- [x] The proof identifies TypeScript recursion, instantiation, union-size, circular-relation, and plugin-projection limits.
- [x] `UltimaBase.Schema.define()` proves the zero-plugin portable case, configured descendants prove application-local typing, and compatible reuse plus package-specialized schemas require no second compiler.
- [x] `field.vector()` completes and infers its exact current value/options only on a factory configured with `pgVectorPlugin()`; the zero-plugin and unrelated factories reject it with a focused diagnostic, without claiming PostgreSQL persistence.
- [x] The prototype is removed or kept only as test tooling explicitly required by later issues; no production facade ships from this issue.
- [x] Documentation impact is recorded.

## Stop conditions

- The exact `App.Schema.define({...})` syntax cannot type Access and Hooks from sibling `fields` declarations.
- A plugin-added surface needs ambient global augmentation, a manual generated declaration, or a duplicate type registry.
- The 50-schema profile exceeds the locked latency, memory, or hover-readability ceiling.
- Any current capability needs `Schema.use()`, automatic registration, or a second plugin installation path.

## Tests

- [x] TypeScript compiler and real language-service proof suite.
- [x] Source and packed-package module-resolution variants.
- [x] Deterministic benchmark harness with raw samples and summarized distributions.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision, old-form measurements, fixture scope, and every unavailable prerequisite before implementation.
- [x] Audit the complete issue diff against the saved DX, all represented capabilities, source/packed parity, Typegen-generation and edit-to-diagnostic benchmark fairness, hover readability, sole ownership of cross-schema names by Typegen, and absence of generated plugin-surface fallback code.
- [x] Record every audit iteration and raw measurement location in the handoff; correct findings and repeat the complete audit until none remain.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no budget, assertion, fixture, coverage input, or sample may be weakened to pass.
- [x] Complete every acceptance/test checkbox, record exactly one Documentation impact classification, and pass `yarn validate:full` before setting `completed`.
- [x] Create one dedicated local commit only after the green audit, inspect its complete diff and exact line categories, and amend/re-audit if that inspection finds anything. Do not push.

## Out of scope

- Changing a production public API.
- Removing or redesigning Typegen contracts unrelated to plugin-added surfaces or named cross-schema resolution.
- Accepting the architecture ADR before the proof passes.

## Starting evidence

- Starting revision: `afd4c8b4`.
- Existing form: application-specific declarations are emitted by
  `@ultimabase/typegen`; production exports remain unchanged throughout this
  issue.
- Required fixture profiles: 1, 10, and 50 schemas in both source and packed
  package resolution modes.
- Unavailable prerequisites at start: none. Physical PostgreSQL vector
  persistence is deliberately outside this issue; the vector proof covers only
  conditional field-builder typing and static compilation.

## Architecture stop evidence

The first disposable compiler probes separated the local projection problem
from cross-schema name resolution:

- A generic immutable factory successfully projected `field.vector()` after
  `.use(pgVectorPlugin())`, rejected it on `UltimaBase.Schema`, inferred the
  exact `readonly number[]` value, and contextually typed Access and Hooks from
  the sibling `fields` result. The strict TypeScript probe completed with no
  diagnostics.
- With the current `target: 'User'` relationship form, the schema class retains
  only the literal target name. TypeScript has no declaration produced by a
  separate later `Schema.define()` call that maps that name back to the exact
  class, so an equality assertion between the resolved pointer item and the
  declared User item fails with TS2344.
- Replacing the string with a lazy class target recovers exact one-way typing,
  but a mutually recursive User/Post pair makes both independently inferred
  declarations part of one initializer cycle. TypeScript reports TS7022 and
  TS7023 for the schema constants, field callbacks, and target callbacks.

Application construction cannot repair the class types afterward: the later
`new App({ schemas: [...] })` expression cannot change the static types of
previous constants, and the approved form deliberately returns neither a new
factory nor replacement schema bindings. Exact circular name resolution would
therefore require at least one forbidden or unapproved mechanism: generated or
ambient name registration, a manual type declaration, automatic mutable
registration, or a changed/grouped schema declaration form.

This triggers the issue stop condition covering an ambient/global/manual type
registry and the milestone stop condition covering loss of an existing exact
relationship contract. No production API or implementation was changed, no
benchmark ceiling was weakened, and the remaining acceptance criteria and
`yarn validate:full` were not marked complete.

The approved source-module scope was then exercised against the complete
callback boundary rather than only direct schema methods. It succeeds while a
schema callback uses only its own scalar fields and exact pointer identities.
It fails as soon as an Access relationship filter or Hook mutation input must
resolve the target schema's fields: resolving `target: 'User'` evaluates the
source module, whose `User` export in turn depends on the still-inferred `Post`
declaration. TypeScript 6.0.3 reports TS7022 for the schema constant and TS2615
for the circular mapped name registry.

Using the module export key directly instead of reading each schema's
`className` makes the representative User/Post fixture compile, including
Access, Hooks, vector, nested writes, Soft Delete, Password User, and Roles.
That workaround is not capability preserving: it requires `export const Post`
to use `className: 'Post'`. Different identifiers and Runtime class names are
currently legal and common in the repository, for example `const Post` with
`className: 'ReadInputPost'`. Renaming schemas, adding duplicate aliases, or
manually exporting an extra name map would either break existing declarations
or recreate the forbidden duplicate registry.

The disposable implementation was removed after the negative proof. No
production code, public export, generated artifact, test exclusion, or budget
was changed.

## Rejected source-scope resolution

The user approved continuing the proof with one explicit application-local
schema type scope derived from the application's schema source module. The
scope is attached once to the configured factory and must preserve the exact
`UltimaBase.use(...).use(...)`, `App.Schema.define({ className, fields, ... })`,
string relationship target, and `new App({ schemas: [...] })` forms.

The source-module type import is erased from JavaScript. It performs no Runtime
import, schema discovery, mutation, or automatic registration. Core may use it
only to map an existing literal relationship target to the exact exported
schema class for editor inference. The public spelling must remain one concise
type-only attachment and may hide the raw `typeof import(...)` behind a stable
schema-barrel alias; issue 6301 must prove the exact spelling before ADR-0279.

This was not permission to add an ambient registry, generated declaration,
second compiler, alternate plugin installation path, or Runtime schema lookup.
The complete callback proof demonstrated that the source scope could not
preserve the current contract, so it is no longer the target.

## Approved retained-Typegen resolution

The user approved retaining the existing Typegen graph as the sole authority
for literal cross-schema target resolution, including circular and cross-file
relationships. No source module registry or bridge coexists with it.

Plugin definitions instead project their own field builders, direct options,
methods, schema mutations, model commands, and application operations into the
configured factory through ordinary TypeScript inference. Plugin authors no
longer repeat those surfaces in Typegen declarations. Other current Typegen
outputs remain in place until later evidence proves that a specific output is
unnecessary; issue 6301 must not remove them speculatively.

## Proven hybrid contract

The retained graph is one Typegen-owned augmentation of
`GeneratedSchemaRegistry`. It records schema names, developer fields, and the
occurrence of plugin-injected fields needed by named targets. Plugin field
types, field-builder methods, options, schema methods, Role fields, Password
User methods, Soft Delete fields and methods, and application operations are
referenced from their source plugin definitions rather than re-declared by a
plugin Typegen descriptor.

The source projection is accumulated once when `.use()` creates the next
immutable factory. `Schema.define()` therefore consumes one already-composed
projection instead of rescanning every installed plugin for every field and
operation. The proof keeps `UltimaBase.use(...).use(...)`, direct
`App.Schema.define({ className, fields, ... })`, string relationship targets,
and explicit `new App({ schemas: [...] })` registration. A zero-plugin schema
can be reused by the configured application without gaining plugin-only
surfaces. Role specialization is expressed by a source-projected target and
does not introduce another compiler or schema installation form.

The proof is test tooling only:

- `packages/typegen/tests/performance/fixtures/hybrid-authoring-contract.ts`;
- `packages/typegen/tests/performance/fixtures/hybrid-authoring-smoke.ts`;
- `packages/typegen/tests/hybrid-authoring-language-service.test.ts`;
- `packages/typegen/tests/performance/hybrid-authoring.performance.test.ts`.

## Locked budgets

Every production migration issue must preserve these issue-6301 gates on the
same 1/10/50 profiles:

- zero initial compiler and language-service diagnostics, followed by exactly
  one focused diagnostic after the invalid edit;
- median cold typecheck and language-service initialization no greater than
  `110%` of the current-form median;
- median complete edit-to-diagnostic latency no greater than `110%` of the
  current-form median;
- median peak heap no greater than `115%` of the current-form median;
- every warm completion, hover, and cached diagnostic p95 below `500 ms` and
  no greater than `115%` of the current-form value after applying a `5 ms`
  reproducibility floor to sub-resolution observations;
- snapshot compilation plus reduced graph rendering no greater than the larger
  of `115%` of current Typegen regeneration or current regeneration plus
  `15 ms`;
- application declaration bytes no greater than the current generated output;
- hover output below `2,000` characters with source JSDoc retained, and the
  50-schema editor completion containing the first and last scalar fields,
  `id`, and a relationship.

The `5 ms` floor does not relax the user-visible `500 ms` ceiling. It prevents
ratios between cached observations such as `0.07 ms` and `0.17 ms` from turning
timer noise into an architectural failure while retaining the raw values.

## Measurements

The raw isolated samples, summaries, environment, methodology, and reproducible
command are recorded in
[`evidence/6301-hybrid-benchmark.md`](./evidence/6301-hybrid-benchmark.md).
At 50 schemas the hybrid proof reduces median cold checking from `5,756.52 ms`
to `2,846.92 ms`, complete edit-to-diagnostic latency from `3,941.58 ms` to
`1,444.77 ms`, generated declarations from `661,736` to `143,546` bytes, and
peak heap from `1,176.10` to `501.07 MiB`. Median graph regeneration changes
from `86.29 ms` to `92.36 ms`; this conservative measurement includes the real
production snapshot compiler in both forms and loads the current production
package declarations in the hybrid process. All warm editor p95 values remain
below `1 ms`.

TypeScript's demonstrated limits remain explicit: a source module class-name
map participates in circular initializers; export-key lookup loses independent
Runtime class names; lazy class targets fail on mutual cycles; and repeatedly
distributing a plugin tuple through every schema causes avoidable generic
instantiation and memory growth. The accepted shape avoids all four by keeping
one generated name graph and aggregating source projections at `.use()` time.

## Documentation impact

Classification: **internal engineering documentation**. This issue changes no
production export or public behavior. It updates the milestone contract, issue
evidence, benchmark budgets, and future migration boundary; public website and
package README changes belong to the later production migration issues.

## Audit iterations

| Iteration | Finding or evidence                                                                                                                                                                                                                 | Correction or decision                                                                                                                                                                                         | Validation result                                                                                                                               | Remaining findings                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Local plugin projection, sibling Access/Hooks inference, and conditional vector typing are feasible, but exact named circular relationships cannot be inferred across independent schema declarations without an external registry. | Stopped before creating a production facade, benchmark harness, or compatibility path, as required by the issue and milestone architecture stops.                                                              | Positive strict compiler probe: no diagnostics. Negative named-target probe: TS2344. Lazy circular-target probe: TS7022 and TS7023.             | Resolved by the user-approved application-local source schema type scope.                                                                   |
| 2         | The accepted source scope could drift into Runtime discovery, automatic registration, a second registry, or a changed schema declaration form.                                                                                      | Bounded it to one erased type-only factory attachment while preserving the approved factory, schema, string-target, and explicit-registration forms.                                                           | Architecture decision recorded; compiler, language-service, source/packed, and 1/10/50-schema evidence remains required.                        | Prove exact public spelling, complete capability inference, and the locked TypeScript budgets.                                              |
| 3         | The complete callback proof makes the source module map participate in the User/Post initializer cycle for exact relationship filters and Hook mutation inputs.                                                                     | Rejected export-name lookup because it removes independent `className` identity; removed the disposable prototype and stopped before benchmarking or production changes.                                       | Class-name scope: TS7022 and TS2615. Export-key-only scope: strict proof passes but violates an existing schema-naming capability.              | Architecture review: retain the existing Typegen graph as sole cross-schema name authority, or choose a different capability-complete form. |
| 4         | The user confirmed that Typegen was created for this cross-schema problem and must remain there, while plugin-added methods and fields should become ordinary source inference.                                                     | Reopened the issue with Typegen as the sole named schema graph, rejected the source scope, and limited source projection to plugin-owned surfaces without author-maintained Typegen duplicates.                | Revised architecture boundary recorded; the representative source/packed proof and 1/10/50 measurements remain required.                        | Prove the hybrid boundary, identify exactly which current Typegen outputs remain necessary, and lock the budgets.                           |
| 5         | A first hybrid prototype distributed the complete plugin tuple through every schema use and a synthetic baseline omitted the current developer source, making both the implementation and comparison misleading.                    | Aggregated source projections once at `.use()`, replaced the synthetic baseline with the real packages and production Typegen generator, and shared one runtime fixture across both forms.                     | Source and packed language-service checks pass; the realistic 1/10/50 benchmark passes with zero initial diagnostics.                           | Audit generated-field ownership, raw sample retention, hover documentation, file budgets, and the complete validation contract.             |
| 6         | The first performance test used the upper sample for an even-sized “median”, omitted actual snapshot compilation from the hybrid timing, and let the proof contract exceed the 700-line test budget.                                | Corrected the median, included production snapshot compilation, retained raw samples, added documented hover checks, removed redundant generated public aliases, and reduced the fixture to 699 lines.         | Compiler, source/packed language-service, issue metadata, formatting, and the complete benchmark pass.                                          | Run the complete issue audit and `yarn validate:full`; any finding keeps the issue in progress.                                             |
| 7         | Under the complete parallel suite, one scheduler pause made a 15-read p95 equal the maximum and exceed the 5 ms reproducibility floor despite an isolated green benchmark.                                                          | Increased warm samples to 40 so p95 excludes the two slowest observations, retained every absolute and relative ceiling unchanged, and regenerated all raw evidence.                                           | The isolated benchmark passes; median 50-schema warm completion, hover, and diagnostic p95 remain below 1 ms.                                   | Rerun `yarn validate:full` with the required local-listener permission, then complete the final diff audit.                                 |
| 8         | The current-form process loaded real package declarations while the hybrid process loaded only its minimal proof contract, overstating cold-check and memory improvements.                                                          | Made the hybrid process load every current representative production package as a conservative common baseline, removed the unrelated proof contract from the legacy editor fixture, and regenerated evidence. | The stricter benchmark passes; 50-schema cold check, edit latency, declarations, and peak heap still improve by 50.5%, 63.3%, 78.3%, and 57.4%. | Rerun the invalidated complete validation and final audit; no architecture or functional finding remains.                                   |
| 9         | The final diff preserves the approved syntax and capabilities, keeps Typegen as the sole name graph, contains no production API change, and leaves no unresolved audit finding.                                                     | Marked the evidence issue complete and advanced the plan only after the conservative benchmark and complete repository validation passed.                                                                      | `yarn validate:full`: 551 ordinary files and 2,605 tests; 626 coverage files and 2,853 tests; coverage 90.91/84.48/96.07/91.47.                 | None.                                                                                                                                       |
