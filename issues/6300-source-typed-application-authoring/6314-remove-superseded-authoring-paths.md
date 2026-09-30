# 6314: Remove superseded authoring and application paths

- Status: planned
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

## Acceptance criteria

- [ ] Verify issue 6317 removed constructor plugin installation and issue 6318 removed standalone ordinary `Schema.define()`; do not reintroduce either path.
- [ ] Redundant public application schema handles and ordinary repeated `{ ultimabase }` selection are removed where direct class/model commands preserve the capability.
- [ ] Internal handles remain private only when they protect Runtime ownership or a current advanced capability and do not expose a parallel ordinary developer path.
- [ ] Temporary normalization, delegation, overload, deprecation, feature-flag, migration-only type, and error branches are removed after their last consumer.
- [ ] No compatibility package, alias, re-export, second generated registry, or deprecated facade preserves a removed form; the retained Typegen graph remains the only generated name authority.
- [ ] Runtime ownership, lifecycle, explicit schema registration, source and packed exports, JavaScript behavior, and focused removed-form diagnostics remain correct.
- [ ] Repository searches, dependency constraints, public export guards, package archives, examples, and documentation prove the absence of superseded paths.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Positive canonical-form and negative removed-form tests in source and packed packages.
- [ ] JavaScript, lifecycle, ownership, direct-command, plugin-order, and explicit-registration regressions.
- [ ] Public export, dependency, deep-import, removed-vocabulary, and archive absence guards.
- [ ] Locked TypeScript performance, memory, declaration-size, production-line, and public-export budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the post-6318 starting revision and a complete inventory of remaining temporary paths created by issues 6303–6312 plus surviving old-form consumers.
- [ ] Audit the complete diff and repository for surviving aliases, overloads, adapters, branches, exports, types, errors, docs, fixtures, packages, duplicated internals, and accidentally removed advanced capabilities.
- [ ] Record each finding and correction in the handoff; rerun absence searches, canonical/negative/source/packed tests, budget checks, and the complete removal audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a deprecated or undocumented survivor still fails the criterion.
- [ ] Complete every acceptance/test checkbox, locked budget, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Removing an advanced capability merely because its ordinary facade changed.
- A compatibility release or deprecation window.
- New authoring shortcuts beyond the approved target.
