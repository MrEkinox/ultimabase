# 3107: Decide the three unused public protocol candidates

- Status: completed
- Milestone: 31
- Packages: architecture documentation; @ultimabase/core, @ultimabase/typegen, @ultimabase/postgres-plugin, @ultimabase/testing
- Depends on: 3106
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Resolve three independent public-contract decisions before any conditional removal, using current consumers and required invariants.

## Acceptance criteria

- [x] RC-04: inventory runtimePipelineStage and its normalization/commit-only contribution path. Distinguish it from runtimeInterceptorCapability/provideRuntimeInterceptor and preparedOperation, which ACL actually uses.
- [x] RC-05: inventory TypegenEmitterCapability/typegenEmitterCapability, its production provider and actual conditional-privilege fixture consumers. Explicitly document loss of single-provider conflict/inspection/requirement/conditional-activation semantics if removed; generation and deterministic output must remain.
- [x] RC-06: inventory the exact migration-exclusive exports, privileges, snapshot fields, planning helpers, PostgreSQL contribution/preparation tokens and testing helpers. Classify private-storage/physical-schema/provenance consumers separately.
- [x] Resolve FakeAdapterMigrationHistory and other real engineering usage explicitly with the user. The concrete exception was explicitly accepted on 2026-09-21.
- [x] For each candidate separately, prepare exact old/new behavior, affected public contracts/site pages, smallest deletion scope, preserved invariants and alternatives. Stop for the user's decision before accepting ADRs.
- [x] Record approved removal or retention per RC ID and cross-reference C-035, C-039, C-023/C-026 and P-016 from the final milestone 30 matrix. Broad old R-001–R-010 approval is insufficient.
- [x] Keep 3108–3110 conditional until their own decisions are resolved. For retained candidates, record the accepted reason and mark their removal issue superseded, not completed. Reconcile affected future migration backlog dependencies without implementing that feature.
- [x] Do not replace removed powers with a renamed public marker, callback registry, private official-plugin path or new testing API.

## Tests

- [x] Audit repository and packed public consumers, privilege/conformance coverage, Typegen initialization and PostgreSQL/private-storage boundaries for each candidate.
- [x] Validate new ADR proposals and scope consistency, links, metadata, formatting and git diff --check.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Production removals, treating all three decisions as one implicit approval, or eliminating used adapter/provenance infrastructure.

## Handoff

Preparation at `a539cfc8`, following the green 3106 audit and dedicated commit
(+2,335 / -4,349 = -2,014 lines; production -2,256). Refreshed remote state:
`main` is eight commits ahead and zero behind `origin/main`. No push.

### Independent decisions accepted on 2026-09-21

| Candidate | Concrete proposal                                                            | Accepted outcome                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC-04     | [ADR-0264](../../docs/adr/0264-remove-unused-runtime-stage-contributions.md) | Remove the five stage-factory exports and only their interceptor/assembly branch in 3108.                                                        |
| RC-05     | [ADR-0265](../../docs/adr/0265-remove-typegen-emitter-marker.md)             | Remove the marker and its uniqueness/inspection/requirement/conditional-privilege convention in 3109; adapt the identified engineering fixtures. |
| RC-06     | [ADR-0266](../../docs/adr/0266-defer-migration-only-protocols.md)            | Remove the exact migration scaffold plus the used public testing helper in 3110, retaining current persistence.                                  |

The user answered "validé" after the three separate questions and their exact
consequences were presented. Each RC is accepted; no candidate is removed in
this documentation issue. Unknown external consumers cannot be excluded by
repository search; these are explicit public API decisions. Issues 513–515 and
their milestone now record ADR-0266; 513 is blocked on the future integration
decision rather than falsely ready against a disappearing protocol.

Documentation impact: **internal engineering documentation**. These changes
record accepted decisions and correct consumer evidence, without changing the public
API or current website guidance. Each proposed ADR identifies the site pages
to review/update in its conditional implementation issue.

### Preparation audit loop

| Iteration | Finding/evidence                                                                                                                                                                                                                                                       | Correction                                                                                                                                                              | Validation                                                                                                                  | Remaining                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1         | The initial "no reader" claim missed Typegen token availability consumed through optional requirements and conditional privileges. Migration metadata was not distinguished sufficiently from live rename/storage metadata.                                            | ADR-0265 enumerates those fixtures and the behavioral exception; ADR-0266 retains `renamedFrom`, all physical snapshot fields, private storage and generic conformance. | Source, public barrels and existing packed conformance scenarios reviewed.                                                  | Corrected in the proposals; independent user decisions remain pending.   |
| 2         | Full preparation review: checked all proposed exports/unions, actual conditional consumers, retained physical metadata/renames, pending status, historical matrix, site pages and dependent issues. Stale progress summaries and one nonexistent page name were found. | Updated plan/history status and the page reference; preserved historical decisions and marked all new ADRs proposed.                                                    | 64 unit/type checks, 11 built/packed checks, public export inspection, 370 relative links, formatting and diff checks pass. | No preparation finding; the three user decisions still block completion. |

### Verification evidence

- Focused `yarn vitest run --project unit --project types`: 64 tests in 13 files,
  including Runtime stage factories/assembly, conditional capability and
  declaration tests, Core/PostgreSQL adapter bridges, migration planner,
  `FakeAdapterMigrationHistory` runtime/type checks and backlog metadata.
- `yarn vitest run --project e2e packages/core/tests/e2e/core-runtime-capabilities.e2e.test.ts packages/core/tests/e2e/core-plugin-manifest.e2e.test.ts tests/e2e/open-kernel-proof.e2e.test.ts`:
  11 tests in three files pass against current built/packed packages.
- Built package import inspection confirms the nine proposed runtime exports;
  TypeScript module-symbol inspection confirms 23 named public contracts,
  including retained containers whose fields/unions change.
- All 13 changed/new files are engineering Markdown. All 370 relative links
  resolve. Prettier and `git diff --check` pass. There is no production, test,
  dependency, generated artifact or website edit in 3107 preparation.
- The full typecheck, build, lint, coverage, built/PostgreSQL and website checks
  from 3106 still describe the unchanged implementation. They are not claimed
  as rerun for this documentation-only preparation. The suspended stash is intact.

No production/test implementation exceeds the issue: none was edited.
Approval derives from the explicit response to the three 3107 questions, not
from 3105 or the historical removal list. Final decision audit and documentation
checks are recorded below; the dedicated commit is reported after creation.

### Final decision audit

Iteration 3: reviewed all 17 changed/new Markdown files against the explicit
user answer. All three ADRs record exact accepted scope and exceptions; live
API documentation remains current until each implementation. Future migration
assumptions are reconciled without new APIs or production work. Historical
milestone 30 decisions and the suspended Soft Delete stash remain intact.

Validation: `yarn check:issues`, Prettier for the complete changed file set,
relative-link validation and `git diff --check`. The 64 focused unit/type and
11 built/packed tests from preparation are reused because implementation and
tests are unchanged. No unresolved finding remains.

Dedicated local commit only; no push. Next issue: 3108 under accepted ADR-0264.
