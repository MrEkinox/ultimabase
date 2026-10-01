# 6312: Migrate Plugin Kit, testing, and community conformance

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/plugin-kit`, `@ultimabase/testing`, repository plugin fixtures
- Depends on: 6311
- ADR: ADR-0279, ADR-0281
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Prove that community plugins can expose every current contribution through the
same Core-native source-typed contract, with Plugin Kit remaining optional and
testing helpers remaining representative rather than privileged.

## Baseline inventory

- Starting revision: `15f68c5f`; `main` is twelve commits ahead of the
  refreshed `origin/main` and the worktree was clean. No push is authorized.
- Core already owns the source declaration receipts and all privilege,
  ownership, manifest, resource, and conflict checks. Plugin Kit provides
  optional option parsing, contextual field/option helpers, additive patch
  builders, and post-commit event composition; it has no independent registry.
- The public testing conformance runner still constructs applications through
  the deprecated constructor `plugins` list in its ordinary, denial, and
  multiple-instance paths. Its fixture preserves the exact plugin tuple but
  not a configured factory. Plugin Kit tests likewise retain constructor
  fixtures. Community source/packed editor and broad negative-power coverage
  require explicit comparison with the accepted Core-native boundary.

## Acceptance criteria

- [x] Plugin Kit helpers remove duplication over the Core-native declaration contract but do not create a second contract, registry, lifecycle, ownership, privilege, or type-projection path.
- [x] A plugin written without Plugin Kit retains the same supported manifest, identity, dependencies, peers, privileges, claims, capabilities, contributions, resources, setup, cleanup, and source-typing powers.
- [x] Conformance covers fields, options, immutable patches, operations, schema mutations, model surfaces, middleware, protected constraints, persistence-plan rewrites, exact instances, conflicts, order, and application-lifetime resources.
- [x] Removed generic decoration, replacement, observer, Query-extension, destructive-patch, arbitrary schema/model-operation, and manual Typegen powers remain rejected.
- [x] Testing helpers construct only public contracts, support configured factories, source and packed modules, JavaScript, multiple instances, lifecycle failures, and deterministic cleanup.
- [x] Representative Typegen-backed community authoring fixtures need no deep import, cast, plugin-owned ambient augmentation, generated plugin declaration, official-plugin identity, or package-specific Core exception. The Runtime-only equality test retains one cast because it intentionally loads no generated `WhereInput` (ADR-0281).
- [x] Superseded Plugin Kit, testing, fixture, and Typegen paths within this issue are removed; the retained complete `WhereInput` and later repository-wide migration paths remain assigned to 6313/6314.
- [x] Plugin-author READMEs, examples, conformance guidance, and public documentation are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Core-only and Plugin Kit community-plugin conformance matrices with equivalent Runtime and editor assertions.
- [x] Source, packed, JavaScript, multiple-instance, privilege, conflict, lifecycle, and removed-power regressions.
- [x] Locked TypeScript performance, memory, and declaration-size budgets, with the synthetic-fixture caveat recorded for 6316.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every Plugin Kit helper, testing shortcut, community fixture, conformance guarantee, and removed-power guard.
- [x] Audit the complete diff for hidden official privileges, Core dependency reversal, duplicate contracts, weaker community capabilities, deep imports, casts, ambient leakage, missing negative tests, stale Typegen, and documentation drift.
- [x] Record each finding and correction in the handoff; rerun both Core-native and Plugin Kit conformance matrices plus the complete plugin-author audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; official-plugin success cannot substitute for community-plugin parity.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- New plugin powers or a new official plugin.
- Making Plugin Kit mandatory.
- Restoring a power removed by ADR-0259.

## Inventory and diff audit

- Plugin Kit publishes only `definePluginOptionsParser`, contextual field and
  output helpers, the immutable `schemaPatch`/`patchSchemas` builder, and
  plugin-event contract/dispatcher helpers. Each delegates to a Core
  declaration or a privilege-checked capability; no Plugin Kit registry,
  installation path, compiler, or Runtime owner exists.
- The testing package owns the immutable fixture and suite, a runner that now
  replays the exact support/subject tuple through public `UltimaBase.use()`,
  optional static snapshots and Typegen checks, and PostgreSQL worker setup.
  Its source and packed language-service tests, packed JavaScript subprocess,
  multiple-instance, denial, failure, and cleanup checks cover those shortcuts.
- The community fixtures cover Core-only operations and schema mutations in
  `packages/testing/src/plugins/conformance.test.ts`, Plugin Kit field/option/
  patch authoring in `packages/plugin-kit/src/authoring.test-d.ts`, and the
  open-kernel workflow, portable value, soft-delete, constraint, persistence
  rewrite, PostgreSQL, and transport verticals under `tests/e2e`. Core's
  `plugin-source-projections.test-d.ts`, capability-composition suite,
  `removed-kernel-powers.test.ts`, package-archive export test, manifest,
  additive-patch, application-surface, and Typegen-declaration tests protect
  the same source and negative-power boundaries without Plugin Kit.
- Typegen still consumes Core's authorized graph and public type references.
  No community fixture appends a manual generated declaration or output. The
  complete generated `WhereInput` is deliberately retained by ADR-0281 and
  belongs to issue 6313's preservation and issue 6316's measurement, not a
  superseded Plugin Kit projection in this issue.

The audit found and corrected four concrete issues: the conformance runner
still used the deprecated constructor plugin list; the value fixture erased
its plugin source type and cast its schema options; the custom portable
equality filter could not be inferred correctly from source after two bounded
attempts, so the user accepted ADR-0281 and the Typegen-backed editor proof;
and the PostgreSQL community fixture declared `postgres` on a factory that
did not install PostgreSQL. It now reuses the same PostgreSQL/Hook factory for
schema declaration and application construction. Root typecheck and its
PostgreSQL E2E test pass after that last correction. A separate, explicitly
requested audit-blocker fix for concurrent PostgreSQL upsert is recorded below.
The staged-diff review also corrected two documentation details: the adapter,
not PostgreSQL itself, rechecks the declared upsert target, and a conformance
schema factory must install its required support plugins before the subject.

The remaining `as never` is confined to the Runtime-only custom equality
test; no supported Typegen-backed authoring fixture needs that cast. No
package deep import, plugin-owned ambient augmentation, official-plugin
identity requirement, parallel registry, Core dependency reversal, new public
plugin power, or hidden privilege was added. The final complete gate and built
E2E both passed after the fixture correction; no unresolved audit finding
remains.

## Architecture stop: community field query typing (2026-09-30)

The final milestone audit consolidates the recorded handoff into this table.
The prose below retains the original failures and exact validation results.

| Iteration | Recorded finding                                                                                                          | Correction and evidence                                                                                                                                                          | Remaining work at that checkpoint                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1         | Deprecated constructor installation and erased/cast community source options survived.                                    | Migrated the runner and returned declaration receipts; source options infer directly.                                                                                            | Prove custom portable-field queries.                                         |
| 2         | Two bounded codec-presence attempts could not type the existing equality query.                                           | Removed the experiment; user-approved ADR-0281 retains all WhereInput contracts and a generated editor proof.                                                                    | Correctly permissioned complete validation.                                  |
| 3         | Full coverage failed the unchanged concurrent PostgreSQL upsert case.                                                     | At the user's explicit request, reproduced the unrelated unique-index collision and fixed speculative insert/re-locking; focused stress and unrelated-key regression tests pass. | Final community fixture and diff review.                                     |
| 4         | A community schema declared PostgreSQL options without installing that plugin; two documentation details were inaccurate. | Reused its installed factory and corrected adapter/conformance explanations; final full and built gates pass below.                                                              | No issue-local implementation finding; complete graph costs remain for 6316. |

The community decimal fixture now creates its plugin before the schema and
returns Core declaration receipts. `UltimaBase.use(value).Schema.define(...)`
accepts its `decimalLedger` and `decimalLabel` options without the old schema
cast. The fixture's existing custom field also appears on the source schema.

Removing the remaining `as never` from its supported equality query does not
typecheck: TypeScript reports TS2769 because `where.amount` accepts only
`NullFilter`, not `{ eq: DecimalValue }`. Core's source filter currently grants
equality to built-in kinds and structural-containment fields, while the
community field has a portable storage codec and the retained generated graph
already exposes `PortableEqualityFilter<DecimalValue>`. Runtime and the
PostgreSQL test still execute the equality query successfully. Pretending the
custom kind is a built-in kind or silently dropping equality would lose a
current community-plugin capability.

The user approved a bounded proof of projecting the existing authorized
portable-codec equality power into source field types. Two attempts to infer a
codec-presence type parameter in `definePluginField()` failed root typecheck:
the first defaulted the parameter to `undefined` and rejected existing codec
calls; the second widened it to `boolean`, changed existing plugin field types,
and still left this fixture's `where.amount` as `NullFilter`. The fixture's
explicit `DecimalField` return annotation also erases any newly inferred
capability before the patch receives it. The patch itself has not been proven
to erase precise field types. This is not proof of a TypeScript impossibility.
Per the agreed two-attempt stop rule, the experiment was fully removed; no
Core change, parallel registry, fallback API, or new cast was retained.

The user chose to retain the complete generated `WhereInput` for every schema
through this milestone, not just for custom fields. ADR-0281 records that
decision. Do not spend more time on source-only `where` typing before issue
6316's limitation-by-limitation audit. Typegen already contains the correct
portable equality filter, without a manual plugin declaration. The remaining
issue-6312 test fixture must distinguish its non-generated source fallback
from a Typegen-backed application before its no-cast acceptance can be judged.
The built-export language-service fixture now checks that a configured
`App.Schema.define()` class accepts the generated custom-field equality
filter and rejects an invalid value without a cast; its focused six-test E2E
suite passes. This does not remove the cast from the separate PostgreSQL
Runtime test, which has no generated registry loaded.

At this point, issue 6312 remained in progress with all acceptance boxes open
and no commit. The last complete `yarn validate:full` predated the fixture
changes and showed 84.37% branch coverage versus 84.38% at issue 6311. A
focused invalid-JavaScript-input regression was added to recover that branch.
Targeted checks then passed: root `yarn typecheck`, 24 Plugin Kit/testing unit
and type tests, and 10 open-kernel/Plugin Kit/JavaScript E2E tests including
PostgreSQL. The remaining cast is deliberately preserved only in the
Runtime-only TypeScript test because that test does not load the generated
registry; the companion generated editor test proves the supported TypeScript
authoring query without a cast. The later complete gate result is recorded
below.

The first complete rerun used the restricted sandbox and hit the known local
HTTP listener `EPERM`; it was interrupted and does not count. The correctly
permissioned `yarn validate:full` passed formatting, typecheck, 557 ordinary
files/2,649 tests, lint, and build, but failed coverage at 635 passed files and
one failed file (2,910 passed tests, one failed). The sole failure was the
unchanged `Runtime to PostgreSQL > executes ordered atomic bulk, set writes,
and unique upserts` test with a PostgreSQL data-constraint error. Its concurrent
upsert case supplies two identical values for both the targeted unique `email`
index and the independent unique `(tenantId, handle)` index. The same test
passed eight subsequent isolated executions; that first failure did not expose
the driver constraint. ADR-0069 requires the
adapter to retain an explicit conflict key, so treating another index as an
update target would be unsound. At that point the complete gate was red and
issue 6312 could not advance. The isolated passes did not count as a green
gate.

## Explicitly requested validation-blocker fix

The user asked to fix the failing PostgreSQL test before continuing. A bounded
500-pair stress reproduction identified PostgreSQL code `23505` on the
independent `(tenantId, handle)` unique index while the upsert targeted `email`.
The adapter now suppresses only the speculative insert on any unique collision,
then re-locks the original explicit target. It updates only a row matching that
target; a conflict on another row still fails with `VALIDATION_ERROR`. The
declared target must still match `id` or a compiled unique index, and no Core,
public query, or plugin contract changed. This fixes an existing gate failure
outside 6312's original acceptance criteria at the user's explicit request.
The focused unit and PostgreSQL E2E suite passes 17 tests, including 100
concurrent pairs and an unrelated-key rejection; root typecheck and formatting
pass. The first green, correctly permissioned `yarn validate:full` then passed 557
ordinary files/2,649 tests and 636 coverage files/2,911 tests, with 90.88%
statements, 84.39% branches, 96.04% functions, and 91.45% lines. Build,
constraints, issue metadata, and public website validation passed. The separate
complete built-E2E run passed 102 files/406 tests. The 1/10/50-schema locked
benchmark passed twice; the samples and methodology are recorded in
[`evidence/6312-plugin-author-benchmark.md`](evidence/6312-plugin-author-benchmark.md).
That synthetic benchmark does not measure the retained complete production
`WhereInput` declarations; issue 6316 owns the true final declaration and
regeneration comparison.

After the final PostgreSQL community-fixture correction, the complete
`yarn validate:full` passed again: 557 ordinary files/2,649 tests, 636
coverage files/2,911 tests, zero type or lint errors, and 17 website files/66
tests. Coverage was 90.87% statements (23,886/26,284), 84.39% branches
(14,762/17,492), 96.04% functions (5,022/5,229), and 91.44% lines
(23,160/25,326), all above issue 6311's percentages. The complete built E2E
also passed after that correction (102 files/406 tests). The one-count
coverage variation versus the earlier green run changes no threshold or
product behavior. No implementation beyond the explicitly requested upsert
fix exceeds the original acceptance criteria. No push is authorized.

- Documentation impact: both. The retained `where` dependency changes the
  public TypeScript guidance as well as the milestone's engineering boundary.
