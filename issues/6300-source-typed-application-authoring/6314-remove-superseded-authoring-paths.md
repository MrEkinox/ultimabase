# 6314: Remove superseded authoring and application paths

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`, all repository consumers
- Depends on: 6313
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Delete every temporary pre-migration authoring and application-selection entry
point after Typegen is gone, leaving one public path per approved concern and no
permanent facade or compatibility branch.

## Acceptance criteria

- [ ] The `plugins` application-constructor option and every old-form installation consumer are removed; `UltimaBase.use()` is the sole plugin installation form.
- [ ] The standalone ordinary `Schema.define` entry point is removed; zero-plugin and configured schemas use `Name.Schema.define()` through one compiler.
- [ ] Redundant public application schema handles and ordinary repeated `{ ultimabase }` selection are removed where direct class/model commands preserve the capability.
- [ ] Internal handles remain private only when they protect Runtime ownership or a current advanced capability and do not expose a parallel ordinary developer path.
- [ ] Temporary normalization, delegation, overload, deprecation, feature-flag, migration-only type, and error branches are removed after their last consumer.
- [ ] No compatibility package, alias, re-export, ambient augmentation, generated fallback, or deprecated facade preserves a removed form.
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

- [ ] Record the starting revision and a complete inventory of temporary paths created by issues 6303–6313 plus all old-form consumers present at the milestone baseline.
- [ ] Audit the complete diff and repository for surviving aliases, overloads, adapters, branches, exports, types, errors, docs, fixtures, packages, duplicated internals, and accidentally removed advanced capabilities.
- [ ] Record each finding and correction in the handoff; rerun absence searches, canonical/negative/source/packed tests, budget checks, and the complete removal audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a deprecated or undocumented survivor still fails the criterion.
- [ ] Complete every acceptance/test checkbox, locked budget, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Removing an advanced capability merely because its ordinary facade changed.
- A compatibility release or deprecation window.
- New authoring shortcuts beyond the approved target.
