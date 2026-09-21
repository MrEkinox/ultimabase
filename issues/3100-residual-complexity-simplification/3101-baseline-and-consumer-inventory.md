# 3101: Refresh the baseline and residual-complexity inventory

- Status: completed
- Milestone: 31
- Packages: all current packages and repository tooling
- Depends on: 3034
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Establish a reproducible post-milestone-30 baseline and verify every candidate before removal. This issue performs inventory and measurement only.

## Acceptance criteria

- [x] Record the exact source revision, Node/Yarn/database/runner context, current Git state and measurement commands. Reuse the final milestone 30 matrix as the retained contract, with all its delivered removals already applied.
- [x] Refresh all six initial findings in the linked inventory. Check imports, aliases, reexports, nominal/dynamic registration, source and packed exports, official plugins, applications, generated projects, real engineering tools and retained test invariants.
- [x] Identify the 14 private functions individually and distinguish their 304 declaration-body lines from registries, comments, imports and the separate Hooks field-path duplication. Reject any candidate with a live consumer.
- [x] Record a per-candidate ledger: stable ID, exact symbols/files, owner, real consumers or absence evidence, retained invariants, public/website impact, decision status and required regression evidence.
- [x] Trace the compiler IR's live consumers, Runtime stage composition versus used ACL interceptors, Typegen marker uniqueness, and migration planning's testing consumer. An export or a self-test alone is not a product use; an engineering invariant still counts.
- [x] Capture package/source counts, public export sets/declarations, full coverage and existing internal runtime measurements using existing tools. Record compiler representations/registries and representative change fan-out.
- [x] Carry B/P/C contract IDs forward through a new milestone 31 delta ledger without rewriting milestone 30 evidence. No capability is reclassified as approved for removal by this inventory.

## Tests

- [x] Build packages before measuring declarations; run the existing source, full-coverage and built/packed/PostgreSQL baseline gates and record environmental blockers.
- [x] Run issue metadata, relevant boundary checks, formatting, relative-link validation and git diff --check.

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

No production refactor, public removal, new instrumentation API or changes to paused feature work.

## Handoff

Started from `1f04e5e3` under the user's explicit autonomous execution approval.
The [baseline](../../docs/plans/2026-09-21-residual-complexity-baseline.md)
records environment, exact commands, 23 public roots, 74 unique B/P/C contract
IDs and source/coverage/performance snapshots. Production remains unchanged:
127,093 lines, including 68,780 Core lines, and 1,726 public exports.

Validation: typecheck, build with attw/publint, lint and constraints pass;
full coverage passes 2,779 tests with unchanged milestone 30 percentages;
built/packed/PostgreSQL integration passes 383 tests. Metadata/active-contract
checks pass 14 tests, website content 66 tests, and the website build succeeds.
Formatting, relative links and diff whitespace checks pass.

Audit iteration 1 corrected the initial claim that runPluginDeclarationFactory
was live. Its four-line body was below the discovery scan's threshold; the
entire private declaration-target module has no importer or public export.
Issue 3102 now includes this private cleanup and preserves real compiler paths.
This factual scope correction is the only addition to the initial candidate
list; no new public removal, abstraction or architectural decision was made.
Audit iteration 2 reviewed parity, security/ownership, exports, obsolete-path
evidence, tests/coverage, documentation and scope: no unresolved finding.

Documentation impact: both. Engineering planning and baseline evidence are
updated; the public roadmap states that the second pass is underway. Public
API documentation remains accurate because this issue changes no product code.

The dedicated local commit records this completed issue. Report its exact
added/deleted/net counts after creation; production delta is zero. Next: 3102.
No push is authorized.
