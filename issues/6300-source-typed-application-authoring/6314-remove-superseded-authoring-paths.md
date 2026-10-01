# 6314: Remove superseded authoring and application paths

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`, all repository consumers
- Depends on: 6318
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

After issues 6317 and 6318 migrate their consumers, delete remaining temporary
application-selection paths before removing generated Typegen fallbacks in
issue 6313. Leave one public path per approved concern and no permanent facade.

## Baseline and bounded migration probe

- Resumed implementation revision: `33ea7809` (clean local `main`, 15 commits
  ahead of the verified remote `3c130475`); issues 6317 and 6318 are committed.
  Dynamic schema-name lookup, plugin mutation handles, and portable-schema
  conditional commands are advanced capabilities, not automatic deletion
  candidates. The public `OperationOptions.ultimabase` selector is explicitly
  deprecated migration state; ordinary callers still repeat it throughout the
  repository. Inventory and bounded removal are underway.
- Starting revision: `b48effa0`; refreshed `origin/main` has no commits missing
  locally (`main` is thirteen commits ahead). No push is authorized.
- Initial source/test inventory found 765 textual standalone `Schema.define(`
  occurrences in 305 files and 385 `new UltimaBase(` call sites. These are
  upper bounds, not deletion counts: some hits are strings/comments, and many
  plugin lists belong to the private `FrameworkApplication` and must remain.
- A syntax-aware Core-only probe rewrote 386 call expressions in 133 files to
  `UltimaBase.Schema.define()`. The focused runtime test passed, but the Core
  test typecheck exposed widespread distinct contract failures: unused old
  imports; negative Runtime fixtures whose invalid options become static
  errors; and type assertions that intentionally describe the former
  standalone model/input contract. This is not a safe repository-wide rename.
  The probe was fully reverted. No implementation file remains changed.
- The user approved bounded, package-verified consumer migrations in issues
  6317 and 6318. This issue retains the final removal/audit gate after them.

## Implementation handoff (2026-10-01)

The post-6318 starting revision is `33ea7809`. The old-form inventory comprised
the public `OperationOptions.ultimabase` selector, Password User's separate
`PasswordUserAuthOptions` selector, normalized-option and query-owner branches,
native CRUD forwarding on application schema handles, and a second model-view
binding path for those handles. Ordinary TypeScript, JavaScript, E2E, starter,
example, and website consumers used those paths. Issues 6317 and 6318 had
already removed constructor plugin installation and standalone ordinary
`Schema.define()`; the absence guards still pass.

Core now resolves direct class and immutable-model commands through the sole
active application. Schema handles no longer forward native CRUD, but retain
dynamic schema-name lookup via `.schema`, plugin schema mutations, and `.for()`
for application-specific model mutations. The direct model-result binding and
opaque owner tokens remain because they protect plugin commands, nested results,
and lifecycle ownership; they are not a second ordinary CRUD API. The public
Password User static methods have no application selector. JavaScript calls
with removed extra options fail before credential work. No new facade, registry,
generated name authority, or fallback was added. No new ADR was needed beyond
the approved ADR-0279 target.

The full diff was audited for aliases, overloads, delegation, exports, types,
errors, fixtures, docs, and removed capabilities. Findings and corrections:

1. An incremental TypeScript typecheck had replaced Password Auth's bundled
   `dist/index.d.ts` with a declaration that referenced absent sibling files.
   Rebuilding that package restored its packed types; the final full validation
   passed. This build-artifact collision is a tooling risk for the final audit,
   not a source typing fallback or an added product API.
2. A Password Auth ownership E2E test still expected a conflict created only by
   the removed explicit selector. It now exercises two sequential active
   applications and rejects the foreign User class in a real request scope.
3. A packed JavaScript fixture still called `handle.findOne()`, and a packed
   hover test looked for pre-migration source formatting. They now use the
   direct schema command and its actual source marker. Both focused suites pass.
4. The first built E2E pass also reported one relation-suite setup failure.
   That suite passed alone, and two complete built E2E passes on the corrected
   diff passed all 102 files/406 tests. No persistent failure was reproduced;
   the first failure remains recorded rather than hidden.
5. A PostgreSQL type-test comment incorrectly assigned its test-only generated
   option augmentation to issue 6314. It now names issue 6313, which owns
   removing proven-superseded Typegen projections.

The final milestone audit consolidates the preceding recorded corrections;
these rows reference the original validation evidence, not new historical runs.

| Iteration | Recorded finding                                                                                  | Correction and evidence                                                                            | Remaining work at that checkpoint                                                |
| --------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1         | Incremental typecheck replaced bundled Password Auth declarations with broken sibling references. | Rebuilt that package; the final full gate passes.                                                  | Review ownership and packed fixtures.                                            |
| 2         | A Password Auth ownership fixture depended on the removed selector.                               | Tested sequential owners and rejection of the foreign User in an actual request.                   | Migrate packed legacy calls.                                                     |
| 3         | Packed JavaScript called handle CRUD; an editor assertion used obsolete source formatting.        | Switched to direct schema execution and the actual hover marker; focused suites pass.              | Complete built validation.                                                       |
| 4         | One relation-suite setup failed during the first built run.                                       | Recorded the failure; isolated and two complete built gates subsequently pass 102 files/406 tests. | Final documentation review.                                                      |
| 5         | A PostgreSQL fixture comment assigned generated-option ownership to the wrong issue.              | Corrected it to 6313; final full gate and the complete diff review pass.                           | No issue-local implementation finding; tooling sensitivity is retained for 6316. |

`yarn validate:full` passes on the corrected diff: 557 ordinary files/2,650
tests, 636 coverage files/2,912 tests, typecheck, lint, build, issue metadata,
constraints, and 17 website files/66 tests. Coverage is 90.98% statements,
84.50% branches, 96.10% functions, and 91.55% lines. Source and packed
negative-form, ownership, JavaScript, public-export, archive, and documentation
checks pass. The locked 1/10/50-schema benchmark passes; at 50 schemas the
hybrid/current medians are 3,039.94/8,210.15 ms cold check,
1,249.60/6,545.45 ms edit diagnostic, 143,546/660,585 declaration bytes,
and 550.26/1,461.17 MiB peak heap. This remains the synthetic proof fixture,
not a measurement of the complete production `WhereInput` graph. The separate
20-iteration no-product Runtime medians are 1.091 ms startup, 0.406 ms read,
and 0.528 ms mutation; no material change from the preceding checkpoint is
demonstrated.

The issue changed 157 files with 2,601 lines added and 4,346 removed (net
-1,745): production/tooling 70/-457, tests/fixtures 2,032/-3,303,
examples/site 34/-45, and documentation 465/-541. Core
production is 42/-363 (net -321) and Password Auth production 19/-79 (net
-60). The current repository measurement is 126,400 handwritten production
lines, 1,739 public exports, and 938,102 aggregate package declaration bytes;
Typegen production remains 3,415 lines. These are checkpoint values, not a
claim that the final milestone ceilings of 122,645 lines, 1,720 exports, and
839,935 bytes have been met. Issue 6313 and the final 6316 audit must account
for every remaining generated projection and verify those ceilings without
removing the retained graph or complete `WhereInput`.

Documentation impact: both — Core/package examples, starter and public website
usage changed with the canonical direct-command form; this issue and the
engineering plan record the internal removal and audit. Password Auth's README
already documented only the canonical no-selector static methods, so it needed
no edit. No implementation exceeded the issue's accepted removal scope.

## Acceptance criteria

- [x] Verify issue 6317 removed constructor plugin installation and issue 6318 removed standalone ordinary `Schema.define()`; do not reintroduce either path.
- [x] Redundant public application schema handles and ordinary repeated `{ ultimabase }` selection are removed where direct class/model commands preserve the capability.
- [x] Internal handles remain private only when they protect Runtime ownership or a current advanced capability and do not expose a parallel ordinary developer path.
- [x] Temporary normalization, delegation, overload, deprecation, feature-flag, migration-only type, and error branches are removed after their last consumer.
- [x] No compatibility package, alias, re-export, second generated registry, or deprecated facade preserves a removed form; the retained Typegen graph remains the only generated name authority.
- [x] Runtime ownership, lifecycle, explicit schema registration, source and packed exports, JavaScript behavior, and focused removed-form diagnostics remain correct.
- [x] Repository searches, dependency constraints, public export guards, package archives, examples, and documentation prove the absence of superseded paths.
- [x] Documentation impact is recorded.

## Tests

- [x] Positive canonical-form and negative removed-form tests in source and packed packages.
- [x] JavaScript, lifecycle, ownership, direct-command, plugin-order, and explicit-registration regressions.
- [x] Public export, dependency, deep-import, removed-vocabulary, and archive absence guards.
- [x] Locked TypeScript performance, memory, declaration-size, production-line, and public-export budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the post-6318 starting revision and a complete inventory of remaining temporary paths created by issues 6303–6312 plus surviving old-form consumers.
- [x] Audit the complete diff and repository for surviving aliases, overloads, adapters, branches, exports, types, errors, docs, fixtures, packages, duplicated internals, and accidentally removed advanced capabilities.
- [x] Record each finding and correction in the handoff; rerun absence searches, canonical/negative/source/packed tests, budget checks, and the complete removal audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a deprecated or undocumented survivor still fails the criterion.
- [x] Complete every acceptance/test checkbox, locked budget, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Removing an advanced capability merely because its ordinary facade changed.
- A compatibility release or deprecation window.
- New authoring shortcuts beyond the approved target.
