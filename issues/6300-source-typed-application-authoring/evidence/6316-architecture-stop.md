# 6316 architecture-stop evidence

2026-10-01. Product revision: `2503dfa0`. This is an audit checkpoint, not a
completed final audit or a milestone acceptance report. No product code was
changed during this check. Complexity and measured compiler/memory budgets
fail, so implementation stops for user review under the frozen execution
contract. Passing functional validation does not waive these failures.

## Actual implementation cost

The original product baseline is `3c130475`. For an executable old benchmark,
`3ee12f5e` adds the proof harness but has no production-source difference from
that baseline. Both revisions were built independently. The repository's
`measure-simplification.ts` reproduces the original production/export/byte
totals from the baseline checkout; the current measurement matches 6315.

| Measure                             | Original | Current |   Delta |
| ----------------------------------- | -------: | ------: | ------: |
| Handwritten production lines        |  122,645 | 126,406 |  +3,761 |
| Core production lines               |   67,022 |  70,243 |  +3,221 |
| Other production lines              |   55,623 |  56,163 |    +540 |
| Production files                    |      717 |     729 |     +12 |
| Public package exports              |    1,720 |   1,739 |     +19 |
| Aggregate package declaration bytes |  839,935 | 939,040 | +99,105 |
| Typegen production lines            |    3,415 |   3,367 |     -48 |
| Typegen public exports              |       28 |      28 |       0 |
| Typegen package declaration bytes   |    9,930 |   9,964 |     +34 |
| TypeScript test/support lines       |  133,755 | 136,861 |  +3,106 |

The test baseline is the original `3c130475`, not `3ee12f5e`, which already
contains 1,316 additional proof-test lines. Core accounts for 3,221 of the
3,761 added production lines. Typegen removal does not offset the source
inference cost. Core package declarations alone grow by 75,762 bytes.

Exact `git diff --no-renames --numstat 3c130475 2503dfa0` categories:

| Category                                                   | Changed files |  Added | Deleted |     Net |
| ---------------------------------------------------------- | ------------: | -----: | ------: | ------: |
| Production TypeScript                                      |           121 |  5,502 |   1,741 |  +3,761 |
| TypeScript tests/support                                   |           444 | 11,416 |   8,310 |  +3,106 |
| Markdown/MDX documentation and plans                       |           135 |  6,931 |   1,758 |  +5,173 |
| Generated TypeScript                                       |             7 |     39 |     132 |     -93 |
| Production tooling TypeScript                              |             3 |     12 |      17 |      -5 |
| Other files, including JS benchmark fixtures/configuration |            39 |  1,043 |     446 |    +597 |
| Total                                                      |           749 | 24,943 |  12,404 | +12,539 |

No-renames counts a rename as a deleted and an added path; Git's default rename
detection reports 748 files and +24,904/-12,365, with the same net +12,539.
The checkpoint files themselves are not part of these committed-product totals.
Production excludes tests and generated artifacts under packages/*/src; test
support includes TypeScript below tests/ and _.test.ts/_.test-d.ts.
No package is added. There are two new workspace-only development dependency
edges (Password Auth to pg-vector, Typegen to ACL), not new Runtime dependencies.

## Repeated actual-production performance

Old: `3ee12f5e`; new: `2503dfa0`. macOS 15.7.9 x86_64, Node 24.20.0,
TypeScript 6.0.3. Each checkout owns its dependencies and built package exports;
the old Core declaration resolves inside the old worktree, not the new checkout.
No full validation runs concurrently. Three isolated process pairs alternate
old/new, new/old, old/new, using the existing current-production probe:

```sh
node --expose-gc packages/typegen/tests/performance/fixtures/current-typegen-authoring-probe.mjs 50
```

This runs the real Typegen generator and compiled public packages, not the
synthetic hybrid renderer. [Raw measurements](6316-production-50-raw.json)
retain every observation and editor result. The medians are:

| Measure                             |       Old |       New |  Change |
| ----------------------------------- | --------: | --------: | ------: |
| Generation, ms                      |    83.144 |    83.997 |  +1.03% |
| Cold typecheck, ms                  | 5,542.869 | 8,114.504 | +46.40% |
| Language-service initialization, ms |   365.336 |   375.291 |  +2.73% |
| Edit-to-diagnostic, ms              | 3,755.188 | 6,805.601 | +81.23% |
| Observed peak TypeScript heap, MiB  | 1,169.991 | 1,505.304 | +28.66% |
| Warm completion p95, ms             |     0.910 |     0.865 |  -4.87% |
| Warm hover p95, ms                  |     0.602 |     0.620 |  +3.04% |
| Warm diagnostics p95, ms            |     0.048 |     0.042 | -11.11% |
| Generated application bytes         |   661,736 |   622,608 |  -5.91% |

Every sample has zero cold and initial editor diagnostics, exactly one expected
diagnostic after the edit, identical completion names and the same 809-character
query hover. Warm figures are p95 over 40 reads within each sample; reported
medians are across the three processes. Sub-millisecond ratios are timer-noise
scale, not meaningful claimed speedups. Cold typecheck exceeds the +10% budget;
heap exceeds +15%. Edit latency also exceeds the benchmark's +10% comparison.

Comparability caveat: these are the maintained old/new authoring journeys, not
byte-identical source. Both have 50 schemas, 12 scalar fields each, relationships,
nested fields, vector, User and Role. The new fixture omits explicit User
Access/Hooks/Soft Delete source options that the old editor fixture contained;
the runtime graph omits those explicit User options in both versions. The other
49 source schemas retain those options. Plugin installation order also follows
the new configured User path. This caveat prevents claiming a perfectly
feature-identical controlled experiment or generalizing to every application.
It does not establish a performance pass; the current measured journey is slower
despite that reduced User declaration. No fixture was edited to manufacture a
passing comparison. The independent complexity stop already fails exactly.

The temporary baseline setup initially used the wrong Yarn mode spelling, then
needed the existing Argon2 native build. After correcting the setup, all six
probe processes completed successfully. No source or lockfile changed there.

## Why the earlier green proof is not the delivered gain

`hybrid-authoring.performance.test.ts` compares a manually reduced hybrid graph
with current production, loading current package declarations for both. It does
not compare delivered production with the pre-migration production revision.
Its synthetic registry omits complete generated WhereInput contracts now kept
by ADR-0281. As current production becomes slower, the synthetic hybrid can
still pass its relative assertions. Thus a green test proves that prototype
comparison, not the original milestone's historical production budgets.

The original 50% cold-check / 63% edit-latency prototype gains must not be
presented as delivered gains. The measured production path retains much of
Typegen while adding source projections, source field/query contracts and
configured declaration validation. This is a demonstrated net code cost and a
plausible cause of compiler work, not a profiler-proven allocation attribution.
No new type bridge or source-only graph experiment is started here.

## Retained benefits and limits

Confirmed current DX: one .use installation chain, configured App.Schema.define,
explicit schema registration, local plugin options, conditional plugin builders,
and direct class commands using the active owner. User and Role now both accept
the configured schema namespace. 6315's exact root example typechecks through
public exports and its generated starter passes packed/PostgreSQL integration.

The [6313 inventory](6313-typegen-inventory.md) remains authoritative evidence
for consumed generated output. The file still contains named relationships;
complete WhereInput; complete Access/Hooks/ACL callback descriptors; exact User
results; contextual standalone-specialization builders/options; and advanced
dynamic operation/schema/model surfaces. Source-owned authoring does not mean
all those declarations have become redundant. No new parallel graph is allowed.

Accepted pending-review limits remain separate: nested configured plugin-option
hover can lose JSDoc (rest.count), and packed SchemaResult.update hover can
expand implementation types/abbreviate its result. Exact typing and documentation
are different checks. Physical PostgreSQL vector persistence remains deliberately
out of scope; conditional field.vector presence is the shipped capability.

## Validation and stop decision

6315's complete validation passes: 557 ordinary files/2,654 tests; 636 coverage
files/2,916 tests; website 17 files/66 tests; metadata 1 file/9 tests; typecheck,
lint, builds, public exports and constraints pass. Coverage: statements
23,788/26,145 (90.98%), branches 14,690/17,381 (84.51%), functions 4,998/5,201
(96.09%), lines 23,064/25,191 (91.55%). This is evidence of that product state,
not a complete 6316 capability audit or a claim of a remotely run green CI.

6316 is blocked, not complete. The remaining full capability matrix, complete
old/new DX rendering, descriptor-by-descriptor byte attribution, repeated
1/10/50-schema final suite, Runtime comparison, full packed matrix and two final
coverage runs are not represented as completed. Running them cannot waive the
already proven complexity stop, so no additional full gate or product changes
are initiated without architecture review. The complete final one-file comparison
remains owed after that review; the validated root journey is already in README.

Recommended next decision: retain the approved developer-facing syntax, first
repair the performance gate to measure actual old/new production, then authorize
one bounded experiment to reduce overlap between generated contracts and source
inference. Require explicit before/after limits and a short stop condition; do
not promise the original net-reduction target can be met. Other honest choices
are accepting measured costs explicitly or reverting selected internal changes
after their capability implications are audited. None is enacted by this report.

No thresholds are lowered, no retained capability is deleted, no 6316 commit
is created, and nothing is pushed. The disposable baseline worktree is archived
after preserving these measurements; its generated build/cache is disposable.
