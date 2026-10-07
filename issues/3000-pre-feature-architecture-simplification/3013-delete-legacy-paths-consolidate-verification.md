# 3013: Delete legacy paths and consolidate verification

- Status: completed
- Milestone: 30
- Packages: repository-wide
- Depends on: 3012
- ADR: decisions from issues 3002 and 3003

## Goal

Remove every temporary migration adapter and consolidate repeated conformance
and parity tests without reducing behavioral or coverage evidence.

## Acceptance criteria

- [x] No legacy application-operation, schema-mutation, application-surface,
      Typegen, transport-planning, multi-application, replacement, decoration,
      or removed privilege path remains in production source or public exports.
- [x] Official plugins and examples use only the retained public kernel and
      canonical graph contracts; no deep import or private official path exists.
- [x] Kernel tests prove generic ownership, ordering, lifecycle, security, and
      projection invariants once; plugin suites focus on their product behavior.
- [x] Shared table-driven fixtures cover direct TypeScript, JavaScript, REST,
      GraphQL, packed, and PostgreSQL parity without duplicate execution of the
      same contract.
- [x] Coverage includes, excludes, thresholds, and every remaining statement,
      function, branch, and line location are compared before and after test
      consolidation. No production behavior loses its only regression.
- [x] Package READMEs, public website documentation, examples, architecture,
      roadmap, and plugin-author guidance describe only the retained contracts.
- [x] CI affected-selection maps the simplified dependencies without adding a
      custom scheduler or silently skipping complete validation.

## Tests

- [x] Complete typecheck, unit, type, performance, coverage, lint, format,
      constraints, build, package archive, browser, built E2E, and PostgreSQL
      E2E gates pass.
- [x] Removal searches and public package inventories prove old names and paths
      are absent.

## Audit gate

- [x] Audit the entire milestone diff for surviving parallel architecture,
      missing regressions, changed coverage locations, stale documentation, and
      accidental public API. Correct and repeat the complete audit and full
      validation until green.
- [x] Record exact coverage-map comparison, line, file, export, test, duration,
      and Documentation impact evidence before completion.

## Out of scope

- New product behavior or unrelated CI redesign.

## Implementation and complete-diff audit

The audit covers baseline `5806d87a` through issues 3001–3012 and this cleanup.
It follows B-001–B-012, P-001–P-023, C-001–C-039 and R-001–R-010 in the
contract matrix, with D-001–D-005 explaining the approved differences.

1. Removed the last source-token fallback in private command binding readers.
   Materialization still resolves exact nominal authoring tokens once; Runtime
   readers accept only their canonical compiled command. A shaped copy cannot
   obtain a handler. No public type, export, or plugin authoring API changes.
2. Consolidated identical Hooks/Access manifest and Typegen orchestration in
   the existing cross-package conformance suite. Both provider scenarios retain
   every assertion. Product behavior, failure diagnostics and transaction
   scenarios remain in their owning plugin suites. The existing minimal-example
   fixture continues to verify direct, REST, networkless GraphQL, Yoga and
   PostgreSQL parity; the packed JS fixture still verifies execution without
   Typegen. These represent distinct integration boundaries, not redundant
   kernel implementations, so their executions remain.
3. Corrected surviving replacement/observer promises in the internal Runtime
   and plugin-author guides, plus the stale transport-engine guidance. The
   website roadmap now puts simplification before files/cache. Reconciled the
   root removal history and recorded the already approved ADR-0262 narrowing
   as stable difference D-005 instead of widening an earlier decision.
4. Removal searches found no retained production implementation of the removed
   powers. Matches in historical ADRs/issue evidence, negative public-export
   tests, internal performance fixtures and unrelated field-value replacement
   remain intentional. The original schema/model views remain derived public
   execution contracts; they have real handle consumers and no independent
   declaration registry. They are not disposable migration adapters.
5. Ownership and provenance are validated at declaration/materialization;
   private closures/codecs remain separate from immutable graph facts. Both
   command kinds retain their distinct transaction/authority contracts. Typegen,
   plans and transport execution share canonical facts and exact descriptors.
   Master construction, monotonic constraints, mutation order, cancellation and
   post-commit delivery retain their existing enforcement owners.
6. Core dependency direction and production/example public imports remain
   unchanged. CI already follows both explicit imports in the moved suite;
   no scheduler, package dependency, coverage exclusion or threshold changed.
   No accepted historical ADR was rewritten; no suspended Soft Delete work was
   restored. `.vscode/settings.json` remains outside this change.

The first audit found the residual fallback and stale documentation; this
implementation corrects them. The backlog check also caught the invalid
intermediate status spelling `in progress`; it is corrected to `in-progress`,
the focused check passes, and the full coverage gate is rerun. The final audit
repeats the removal, public
surface, coverage-location and complete validation checks before commit.

## Documentation impact

Classification: **both**. Internal guides, the preservation/removal ledgers and
plan are reconciled. The public website roadmap reflects the active priority.
The ownership map and current application, testing and plugin-author pages were
reviewed: the private reader cleanup and fixture consolidation do not change
public execution, configuration, errors, generated declarations or examples;
their existing contracts remain accurate. No package README edit is needed.

## Scope

No implementation exceeds this issue's acceptance criteria. No new public
abstraction, plugin feature, compatibility option or test infrastructure is added.

## Coverage location proof

Full V8 coverage was captured at `df49ccdd` before source/test cleanup and again
on the final implementation. Both runs cover 704 production files and the same
608 test files / 2,776 tests. `vitest.config.ts` is unchanged from the milestone
baseline: every include, exclusion and global/per-package threshold is preserved.

The JSON comparison identifies locations by statement span, named function
span, branch type/parent/arm span and arm index, plus statement-derived line
coverage. Identical source lines in `bindings.ts` are aligned through the diff;
all other production files have identical maps. It compares covered/uncovered
status rather than hit counts, which legitimately change with shared fixtures.

| Remaining locations | Compared automatically | Reviewed changed spans | Lost coverage |
| ------------------- | ---------------------: | ---------------------: | ------------: |
| Statements          |                 27,577 |                      3 |             0 |
| Functions           |                  5,447 |                      2 |             0 |
| Branch arms         |                 18,493 |                      0 |             0 |
| Lines               |                 26,595 |                      3 |             0 |

The manual spans are `handler` / `#read` signatures and the reader returns at
lines 236, 244 and 256 of `runtime/commands/bindings.ts`; all remain covered
(274, 695 and 969 executions). The removed conditional source resolution deletes
one covered statement/line and six branch arms (five covered, one uncovered).
It introduces no uncovered retained behavior. No other coverage-map location
changes, and no production file is removed from coverage.

| Metric     |                   Before |                    After |
| ---------- | -----------------------: | -----------------------: |
| Statements | 24,762 / 27,581 (89.77%) | 24,761 / 27,580 (89.77%) |
| Branches   | 15,361 / 18,499 (83.03%) | 15,356 / 18,493 (83.03%) |
| Functions  |   5,192 / 5,449 (95.28%) |   5,192 / 5,449 (95.28%) |
| Lines      | 24,043 / 26,599 (90.39%) | 24,042 / 26,598 (90.39%) |

Local evidence is retained in `/tmp/ultimabase-3013-coverage-before`,
`/tmp/ultimabase-3013-coverage-after` and
`/tmp/ultimabase-3013-coverage-comparison.json`; the comparison script is
`/tmp/ultimabase-3013-compare-coverage.py`. The maps can be reproduced with
`yarn test:coverage --coverage.reportsDirectory=<directory>` at the two revisions.

## Final validation and measurements

- Focused command graph: 8 tests; shared/owned conformance suites: 7 tests.
- Full coverage gate (unit, types, performance, source E2E and PostgreSQL):
  608 files / 2,776 tests pass, no type errors, 416.71 s (before: 417.48 s).
- Built/packed E2E and PostgreSQL: 97 files / 381 tests pass, 170.39 s.
  This includes all package archive and public source/packed API checks.
- Root typecheck, publishable build (36.051 s, attw/publint), full lint,
  constraints and formatting pass. Existing line-budget warnings remain;
  no baseline grows. Issue metadata passes all 9 checks after correction.
- Website content/snippets: 17 files / 66 tests; production build, website
  typecheck and browser/accessibility checks: 8 files / 56 tests, all pass.
- The reference Typegen snapshot/output/fingerprint remains byte-identical to
  the pre-3011 8,527-byte fixture after this cleanup.
- Production: 704 files / 127,883 lines (this issue: -4); Core:
  339 / 68,780; tests/support: 708 / 130,638 (this issue: +18); tooling:
  13 / 2,120. Public exports: 1,726; declaration bytes: 858,980, both unchanged.
- Standalone 20-lifetime medians after validation: startup 1.652974 ms,
  read 0.425439 ms, mutation 0.512244 ms; heap before/start/requests:
  8,968,608 / 9,994,240 / 10,190,912 bytes. These local observations do not
  establish a hosted CI or request-throughput speedup.

Final complete-diff, removal, coverage and documentation audit: **green**, with
no remaining finding. Commit this issue separately before selecting 3014;
that checkpoint remains the mandatory stopping point. Nothing is pushed.
