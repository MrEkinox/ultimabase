# 6316 bounded overlap experiment

2026-10-01, resumed by the user's "ok go" after the architecture-stop report.
Baseline product is `2503dfa0`. Preserve the configured API, existing generated
graph and current capabilities; no accepted Typegen fallback is retried.

## Results

Three independent small ablations passed the root `yarn typecheck`, rebuilt Core
and ran the actual 50-schema production probe. Every probe had zero initial
cold/editor diagnostics and exactly one expected diagnostic after the edit.
These are single exploratory measurements, not repeated performance passes.

| Candidate                                                             | Cold check, ms | Edit diagnostic, ms | Observed heap, MiB |
| --------------------------------------------------------------------- | -------------: | ------------------: | -----------------: |
| Reuse generated WhereInput inside SourceSchemaInputs                  |      8,205.082 |           6,776.426 |          1,517.993 |
| Reuse SchemaReference's resolved contract in source projections       |      8,239.681 |           6,887.422 |          1,541.158 |
| Prevent reverse inference through declaration validation with NoInfer |      8,221.366 |           6,781.233 |          1,505.941 |

Current baseline medians were 8,114.504 ms, 6,805.601 ms and 1,505.304 MiB;
the old product medians were 5,542.869 ms, 3,755.188 ms and 1,169.991 MiB.
None of these candidates demonstrates a material improvement. All production
edits were restored with exact patches. No speculative helper is retained.
The shared-contract ablation was not a complete stale-registry/selector parity
proof; its passing typecheck alone would not justify keeping that substitution.

## Compiler trace

A diagnostic-only TypeScript trace of the restored current production ran in
an isolated process. It has zero initial diagnostics and one expected edit
diagnostic. Its instrumented timings are not used as performance gains.

The longest recorded structural-comparison stacks inspect configured Role
options, SchemaHooks and generic SchemaAfterUpdateHook signatures; nested
comparisons reach SchemaResultCommands and model-selection types. One such
callback comparison takes about 1.4 seconds in each checking phase. Events are
nested: their durations must not be added together or attributed independently.
The trace identifies a current hotspot, not the causal regression relative to
an old trace, which was not collected in this bounded experiment.

Temporary evidence remains in /private/tmp: the three probe JSON files and
typecheck/build logs use the prefixes ultimabase-6316-probe-where,
ultimabase-6316-shared-contract and ultimabase-6316-noinfer. The trace directory
is ultimabase-6316-ts-trace.O0plhM. None is a product dependency.

## Boundary requiring a new decision

The existing SchemaOptionTypegenDescriptor supports only a `self` generic:
the exported option type receives the complete options interface's polymorphic
`this`. Hooks then derives a schema reference from that options object.

A concrete next hypothesis is an opt-in `schema` generic, resolved by Typegen
from the existing literal-name graph. A plugin could register a public callback
type accepting that schema directly, while existing `self` consumers keep their
full options context. This would change the public descriptor/Typegen ABI and
must be proven before claiming a speedup. It must preserve complete callback
items, selections, model commands and community consumers of `self`. The Core
would describe this generically and name no concrete plugin. No such API or
generator change is implemented by this experiment.

The small overlap corrections are therefore closed unsuccessfully. Complexity
and actual production performance budgets remain failed. The full final audit
stays open; no milestone completion, full parity pass, new commit or push is
claimed. Restored product typecheck/build and checkpoint metadata are verified;
the last complete product gate remains the recorded 6315 validate:full run.

## Direct-schema descriptor proof: closed without a gain

The user authorized this bounded diagnostic on 2026-10-01: test the proposed
schema generic and discard it if unsuccessful. Product revision is `3a5874d7`,
Node is 24.20.0 and TypeScript is 6.0.3. No product file or build artifact was
modified. Both forms use the maintained current-production fixture, the same
strict compiler/editor runner and an isolated process per sample. Run order is
control 1, schema 1, schema 2, control 2, control 3, schema 3; no concurrent
compiler benchmarks are run.

A disposable TypeScript host override supplies these candidate declarations:

```typescript
interface UltimaBaseGeneratedSchemaOptions<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {}
// SchemaOptions inherits the existing graph's exact schema reference.
// extends UltimaBaseGeneratedSchemaOptions<SchemaReference<TClassName>>
// The generated augmentation uses the identical generic constraint/default.
// readonly hooks?: SchemaHooks<TSchema>
```

Only Hooks' generated import/application changes from
`SchemaHooksOption<this>` to the existing public `SchemaHooks<TSchema>`.
Access and all other self consumers retain their original `<this>` arguments.
The actual option descriptor, snapshot, generator and ABI are not changed or
approved by this diagnostic. The host checks that both cold compiler and editor
read the override. An initial harness path filter missed the linked declaration
path; that rejected harness result was excluded and the filter corrected before
any retained sample.

### Raw 50-schema observations

All latency columns are milliseconds; heap columns are MiB. Completion, hover
and unchanged diagnostics are per-process warm p95 values over 40 requests,
not p95 estimates from three process runs. Cold/edit values are individual
observations, not performance guarantees.

| Sample    |     Cold | Editor check | Edit diagnostic | Editor init | Peak heap | Heap after GC | Completion p95 | Hover p95 | Diagnostic p95 |
| --------- | -------: | -----------: | --------------: | ----------: | --------: | ------------: | -------------: | --------: | -------------: |
| Control 1 | 8094.627 |     6758.796 |        6963.156 |     369.562 |  1925.674 |       821.284 |          0.793 |     0.576 |          0.046 |
| Control 2 | 8132.510 |     6655.758 |        6888.481 |     378.191 |  1927.441 |       821.301 |          0.834 |     0.625 |          0.056 |
| Control 3 | 8171.018 |     6634.158 |        6839.110 |     373.497 |  1921.038 |       821.296 |          0.895 |     0.658 |          0.042 |
| Schema 1  | 8194.267 |     6874.339 |        7025.428 |     357.586 |  2037.669 |       850.130 |          0.789 |     0.583 |          0.042 |
| Schema 2  | 8186.469 |     6792.468 |        6982.395 |     359.411 |  1974.780 |       850.073 |          0.830 |     0.629 |          0.045 |
| Schema 3  | 8215.504 |     6917.025 |        7042.285 |     363.393 |  2036.277 |       850.071 |          0.924 |     0.569 |          0.045 |

Median cold check rises from 8,132.510 to 8,194.267 ms (+0.76%); edit diagnostic
rises from 6,888.481 to 7,025.428 ms (+1.99%). Observed peak heap rises from
1,925.674 to 2,036.277 MiB (+5.74%). Small editor initialization/warm latency
changes do not offset the absence of a cold/edit gain. The transformed generated
file grows from 590,807 to 590,867 bytes. Generation is unmodified and no
production generation improvement is claimed. These measurements compare the
two disposable-host forms only, not historical heap samples from another run.

Every retained sample has zero cold/editor diagnostics, exactly one expected
error after the deliberate edit, and identical completion names and query hover
text. Separate two-schema control/candidate canaries also pass those checks.
They exercise exact inline Hook scalar types, rejected unknown fields, exact
immutable model update payloads, soft-delete commands with required identifiers,
and graph-typed pointer selections. The existing inline Access callback remains
exact. This is a focused packed-contract proof, not a complete source/community
ABI or Runtime parity validation.

The shortcut changes how a schema reference reaches Hooks, not the complete
selection, relation and immutable model-command contracts compared afterward.
Hooks already resolves to that same `SchemaReference` in its existing wrapper.
This explains why removing this intermediate conditional is not demonstrated
to improve the expensive structural comparisons; the earlier trace alone does
not prove their causal share of the regression.

Decision: discard this performance proposal. Process-local overrides end with
each probe, and no public API, Core/plugin implementation or production lines
are retained. Only internal audit notes change. The temporary diagnostic harness
is at `/private/tmp/ultimabase-6316-schema-descriptor.sEJVJ9/probe.mjs`; it is not
a repository dependency. Full validation is not rerun for an in-memory discarded
experiment and no implementation/issue completion is claimed. The last complete
product gate is the recorded 6320 run. Issue 6316 remains blocked; budgets are
not waived, and no commit or push is made.

## Model flattening proof: faster, but rejected pending the hover boundary

The user authorized this separate bounded proof on 2026-10-01 at product
revision `3a5874d7`: test the model flattening hypothesis, discard unsuccessful
changes and explain the result. Node 24.20.0 and TypeScript 6.0.3 are unchanged.
The single target is the private `PersistedSchemaModelWithPointer` alias in
Core. All candidates are process-local compiler-host declaration overrides;
product source, built artifacts, Typegen output and Runtime stay untouched.

A plain removal of `Simplify<PersistedSchemaModel<...>>` fails the readonly
canary: `item.update = item.update` becomes accepted by TypeScript. The actual
error is the unused expect-error directive for materialized readonly commands,
not a failing relation/selection assertion. This candidate is rejected before
performance acceptance; frozen Runtime objects are not changed by the proof.

One corrected variant splits the readonly composition into exact field values,
readonly value helpers, lifecycle identity, readonly `SchemaResultCommands`
and readonly relation/plugin surfaces. It avoids remapping the entire model
while retaining its existing generic arguments and complete capabilities.

### Repeated corrected-candidate observations

The maintained actual-production 50-schema fixture and the same isolated host
are used for both forms, one fresh process per sample, without concurrent
compiler tests. Order is control 1, split 1, split 2, control 2, control 3,
split 3. All latency columns are milliseconds, heap columns are MiB. Warm p95
values are measured over 40 requests inside each process, not estimated from
three runs. The generated declarations remain exactly 590,807 bytes.

| Sample    |     Cold | Edit diagnostic | Peak heap | Heap after GC | Completion p95 | Hover p95 | Diagnostic p95 |
| --------- | -------: | --------------: | --------: | ------------: | -------------: | --------: | -------------: |
| Control 1 | 8006.290 |        6818.771 |  1952.624 |       820.661 |          0.833 |     0.660 |          0.043 |
| Control 2 | 8091.975 |        6745.373 |  1914.947 |       820.651 |          0.793 |     0.568 |          0.041 |
| Control 3 | 8164.313 |        6829.575 |  1956.070 |       820.649 |          0.857 |     0.596 |          0.050 |
| Split 1   | 6419.509 |        5162.081 |  1365.262 |       628.033 |          0.899 |     0.726 |          0.062 |
| Split 2   | 6460.188 |        5183.762 |  1365.712 |       628.025 |          1.036 |     0.714 |          0.077 |
| Split 3   | 6483.954 |        5212.516 |  1367.867 |       628.050 |          0.904 |     0.595 |          0.050 |

Medians: cold 8,091.975 -> 6,460.188 ms (-20.17%); edit 6,818.771 ->
5,183.762 ms (-23.98%); observed peak heap 1,952.624 -> 1,365.712 MiB
(-30.06%). The cold/edit ranges do not overlap in these six observations.
Warm completion/hover medians are slightly worse (0.833 -> 0.904 ms and
0.596 -> 0.714 ms); no warm latency improvement is claimed. These are
same-host candidate comparisons, not final built-product performance or a
replacement for the historical milestone comparison.

Every retained timing sample has zero cold/editor errors and exactly one
expected error after the deliberate invalid edit. Two-schema control/split
canaries retain exact Hook item fields, rejected unknown fields and scalar
payloads, readonly fields and commands, exact selected results with unselected
fields rejected, fetch/delete/update/toPointer and relation commands, rejected
scalar relation names, soft-delete commands and graph-typed pointer selections.
Query completion and hover text are identical. Mutation method completion,
signature, English documentation, example and throws tags are also identical.

### Proven DX tradeoff

The additional editor checks catch a result-hover regression which the original
query-only benchmark does not cover. Hook item hover changes from readable
readonly fields to `Core.SchemaResult<Core.SchemaReference<"Role">>`.
More importantly, the selected result loses its immediately readable `id` and
`field0` shape and displays a long `SelectedPersistedSchemaModel<Pick<...`
instantiation containing internal commands, update expressions and symbols.
Those fields still autocomplete and compile exactly, but result hover readability
is not preserved. This is distinct from the previously accepted method
`Promise<...>` abbreviation and nested plugin-option JSDoc limitation.

The experiment proves a useful performance direction: the complete model
flattening has a measurable cost in this fixture. It also proves why that
flattening cannot simply be deleted as redundant presentation code. It protects
readonly methods and the public readable model view. No claim is made that
one specific compiler cache mechanism explains the complete measured gain.

Decision: reject the plain candidate and do not integrate the faster split
candidate as-is. All process-local overrides have ended; zero production lines
or new public types are retained. Preserve these findings rather than repeating
the same deletion or accepting a new hover limitation without user review.
A follow-up must preserve readable model hovers while keeping the measured
optimization, or explicitly obtain approval for the demonstrated tradeoff.

The disposable harness remains at
`/private/tmp/ultimabase-6316-schema-descriptor.sEJVJ9/model-probe.mjs` as diagnostic
evidence only. No root source/full validation is claimed for this unintegrated
candidate. Only internal audit notes change, with their formatting and issue
metadata checked separately. The last complete product gate remains 6320;
issue 6316 stays blocked, and no commit or push is made.

### Follow-up: flatten only command results

The user's question about retaining readable hovers prompted one further
in-memory diagnostic, not a product integration. Keep the split readonly model,
but apply the existing Simplify only in SelectedPersistedSchemaModel. The exact
selected-result hover, update signature/documentation/tags, query hover and
completion are restored; all focused readonly/selection/command canaries pass
with zero cold/editor errors and one deliberate edit error. Hook item hover
still uses SchemaResult<SchemaReference<"Role">> instead of expanded fields.

One fresh sequential 50-schema control/candidate pair measures cold
7,999.540 -> 6,589.358 ms (-17.63%), edit 6,756.312 -> 5,356.934 ms (-20.71%),
and peak heap 1,955.784 -> 1,401.086 MiB (-28.36%). This is an exploratory
pair, not repeated medians or a full source/built parity/performance gate.
No product edit is made. The named Hook item presentation still needs review,
and a retained implementation would require repeated measurements and complete
validation. This does not establish a universal hover/performance impossibility
or complete the milestone audit.

### Built boundary verification after the user's Go tester

The bounded candidate is now applied to Core's private model aliases. It keeps
readonly values, helpers, commands and plugin surfaces as separate intersections,
then uses the existing Simplify at selected command results only. No Runtime
implementation, public export, plugin descriptor, Typegen graph or generated
application contract changes. This is a working-tree test, not completion of 6316.

Three before samples at 3a5874d7 precede the edit/build; three after samples use
the rebuilt real packages without an overridden compiler host. Runs are fresh
sequential processes of the maintained 50-schema current-typegen-authoring-probe
on the same machine (Node 24.20.0, TypeScript 6.0.3). Each returns zero initial
cold/editor diagnostics and exactly one expected edit diagnostic. Generated
application declarations stay exactly 590,807 bytes; query hover and completion
names stay identical. Times below are milliseconds; heap is MiB. Completion,
hover and cached diagnostics are the p95 of 40 warm requests in each process.

| Sample   | Cold     | Edit diagnostics | LS initialization | Completion | Hover | Cached diagnostics | Peak heap |
| -------- | -------- | ---------------- | ----------------- | ---------- | ----- | ------------------ | --------- |
| before 1 | 8023.295 | 6699.926         | 366.151           | 0.988      | 0.614 | 0.065              | 1538.040  |
| before 2 | 8164.200 | 6658.860         | 369.993           | 0.968      | 0.643 | 0.047              | 1517.536  |
| before 3 | 8126.557 | 6551.224         | 354.727           | 0.931      | 0.630 | 0.044              | 1516.029  |
| after 1  | 6546.842 | 5377.440         | 353.232           | 0.875      | 0.704 | 0.059              | 1181.615  |
| after 2  | 6559.832 | 5379.209         | 366.213           | 0.936      | 0.586 | 0.051              | 1180.771  |
| after 3  | 6618.921 | 5326.182         | 356.858           | 0.930      | 0.837 | 0.064              | 1180.664  |

Median cold analysis falls 8,126.557 -> 6,559.832 ms (-19.28%); full-file edit
diagnostics 6,658.860 -> 5,377.440 ms (-19.24%); peak heap 1,517.536 ->
1,180.771 MiB (-22.19%). Warm completion is 0.968 -> 0.930 ms; warm hover
0.630 -> 0.704 ms. The latter small increase is reported rather than hidden.
These are compiler/language-service measurements, not end-to-end VS Code display
timing, and the fresh actual fixture does not waive historical milestone budgets.

The rebuilt two-schema generated canary passes readonly fields/helpers/commands,
exact scalar diagnostics, update/fetch/delete selections, repeated commands,
relation names, pointers and source-projected Soft Delete. Selected-model hover,
update signature/documentation/example/throws tags, query hover and completions
match the control exactly. Hook item QuickInfo still names
Core.SchemaResult<Core.SchemaReference<"Role">> instead of expanding all fields;
its documentation and exact field types remain. Do not describe all displays
as byte-identical or silently classify this presentation as a permanent exception.

Root typecheck and focused model type tests pass (one file/two tests). The focused
source/packed E2E group passes six files/21 tests, including new readonly and
readable selected-model regressions in both modes. The real package build passes.
The first full validation passes formatting, root typecheck and 557 ordinary
files/2,656 tests, then fails on six lint errors in the new negative fixtures
(self-assignment and one unmarked promise). Replace those assignments with
captured command values and explicitly ignore the invalid promise; no lint rule
is disabled and no product type is loosened. The focused lint then passes with
only the existing non-failing production line-count warning. Full validation
rerun passes the complete yarn validate:full contract: 557 ordinary files/2,656
tests, 636 coverage files/2,920 tests, nine metadata tests, constraints, and
17 website files/66 tests. The covered totals are 23,788/26,146 statements,
14,692/17,384 branches, 4,999/5,202 functions and 23,064/25,192 lines. This is
one covered statement/branch/line below 6320's prior recorded run, with branches
displaying 84.51% instead of 84.52%. The changed production file has empty
statement/function/branch maps because its types erase. Do not claim identical
coverage counters yet: one complete control run used this Core file byte-identical
to HEAD and rebuilt its package. It passes 635 files/2,919 tests but fails the
synthetic hybrid benchmark's generation budget: 103.987187 ms against 99.472390 ms
at hybrid-authoring.performance.test.ts:180. There are no type errors; duration
is 485.31 seconds. This original-Core diagnostic failure is recorded, not waived
or described as a passing control. Vitest cleans/skips reports on failed runs,
so it cannot establish coverage-counter parity. No further complete control
loop is started; the candidate is restored and rebuilt. The successful candidate
coverage JSON was copied before the control to a temporary diagnostic directory
and restored afterward, not replaced by an inferred baseline report. The one-point
coverage difference and generation-budget sensitivity remain open audit findings.
No commit or push, milestone completion or further architecture change is
authorized by this test. After restoration, root typecheck and the paired
source/packed model/type suite pass again (two files/six tests). Final issue
metadata passes nine tests; formatting and diff whitespace checks pass.

The product diff is +24/-19 lines in one Core type file (+5 net); test/support
changes are +87/-1 (+86 net), with no new helper/framework/file. Production is
126,437 lines, Core 70,262, exports 1,739 and built declarations 939,505 bytes
(+153 bytes). All three original complexity ceilings remain missed. Model/schema
examples, Core README and public models documentation were reviewed; their
immutable command/selection contract stays accurate and needs no public rewrite.
The private alias optimization changes no architecture convention or dependency,
so no new ADR is necessary.

### Item hover priority and rollback of the flattening optimization

The user requested a bounded repair of persisted Hook item QuickInfo. Two
process-local Hooks boundary variants leave product files untouched. Mapping
the complete item expands fields and preserves the canary's exact scalars,
readonly fields/commands, selections, relations, pointers, source Soft Delete,
delete nullability and explicitly mutable/optional generic item properties.
One sequential 50-schema control/candidate pair measures cold analysis
6,541.142 -> 7,855.616 ms (+20.10%), edit diagnostics 5,299.820 -> 6,654.417 ms
(+25.56%), and peak heap 1,230.873 -> 1,707.766 MiB. This is exploratory,
not repeated product medians. A neutral conditional intersection displays
fields but retains abbreviated internal intersections; it is not the complete
hover restoration. Neither Hooks variant is integrated.

The user then explicitly prioritizes full readable hovers over a few seconds of
initial analysis and identifies ten schemas as the more typical application.
Restore Core's existing flattened model contract instead of adding another
display layer: model-contracts.ts is byte-identical to HEAD. Runtime, public
exports, Typegen, Hooks generic contracts and capabilities do not change.
Keep the previous readonly/selection regressions; add source and packed
afterOperation.item QuickInfo checks for expanded fields, packed JSDoc and
delete nullability. Root typecheck and the focused source/type suite pass
(four files/nine tests, no type errors). The complete build and packed suite
pass (two files/eight tests). The initial packed run fails one pre-existing
completion assertion because the new fixture already supplies afterOperation,
so TypeScript correctly stops suggesting that duplicate key. Move the new
after-item observer into the existing plugin-owned schemaHooks fixture, keeping
the original root completion check unchanged; the rerun passes every test.
The rebuilt generated canary also restores the complete item display and JSDoc,
while retaining exact command/select/readonly/relation/pointer/plugin checks,
delete nullability and explicit generic item modifiers (zero cold/editor
diagnostics and one deliberate edit diagnostic). Full validation passes.
No completed milestone, commit,
push or budget waiver is claimed. The earlier optimized measurements and
failed original-Core timing control remain historical evidence.

Three ten-schema samples before the rollback use the real built optimized Core;
three after it use the rebuilt original Core. Fresh sequential processes run the
maintained current-typegen-authoring-probe without any compiler-host override on
the same machine and dependency versions. All six return zero cold/editor
diagnostics and exactly one deliberately introduced edit diagnostic. Generated
declarations, query hover and completion names remain identical. The following
values are milliseconds, except peak heap in MiB; warm values are request p95.

| Sample   | Cold     | Edit     | Peak heap | Hover | Completion |
| -------- | -------- | -------- | --------- | ----- | ---------- |
| before 1 | 3149.782 | 1654.068 | 689.112   | 0.623 | 0.852      |
| before 2 | 3140.518 | 1640.894 | 703.263   | 0.834 | 0.900      |
| before 3 | 3148.686 | 1684.645 | 698.155   | 0.758 | 0.949      |
| after 1  | 3621.928 | 1988.241 | 818.094   | 0.658 | 0.824      |
| after 2  | 3603.060 | 1997.285 | 814.866   | 0.594 | 0.801      |
| after 3  | 3547.363 | 1990.397 | 821.158   | 0.624 | 0.838      |

Median cold analysis is 3,148.686 -> 3,603.060 ms (+454.373 ms), full-file edit
diagnostics 1,654.068 -> 1,990.397 ms (+336.329 ms), and peak heap 698.155 ->
818.094 MiB. Warm hover/completion p95 medians are 0.624/0.824 ms after rollback.
These measure TypeScript, not complete VS Code rendering, and compare only the
isolated flattening optimization against its rollback, not original main. The
tiny warm-latency differences are not evidence of a repeatable improvement.
This is the explicit full-hover tradeoff requested by the user, not a claim
that the optimization or every historical milestone performance finding is fixed.

The single yarn validate:full run is started with the required permissions from
the outset and exits successfully: formatting, root typecheck, 557 ordinary
files/2,656 tests, lint, build, 636 coverage files/2,920 tests, nine issue metadata
tests, constraints and 17 website files/66 tests. No threshold is changed.
Coverage is 23,788/26,146 statements (90.98%), 14,692/17,384 branches (84.51%),
4,999/5,202 functions (96.09%) and 23,064/25,192 lines (91.55%). These match
the optimized candidate's successful run exactly, despite the original Core
model contract, so the hover rollback introduces no additional coverage loss.
The older one-point difference from 6320's recorded run remains an audit finding;
it is not silently removed or attributed to the discarded type optimization.

This bounded correction removes the earlier +5-net production experiment and
adds 34 source/packed test/fixture lines. There is no production change against
HEAD, no new type bridge/helper, no change to generated declarations and no
Runtime modification. Earlier readonly/selection tests stay in the working tree.
The full milestone audit remains blocked on its other findings; no commit or
push is made.

Documentation review covers the Hooks README, public Hooks mutation-item
section, and public Models contract. They remain accurate because the existing
model type presentation is restored without changing behavior or public API.
No schema example or new ADR is needed for the rollback. Documentation impact
remains internal engineering documentation in the issue handoff.
