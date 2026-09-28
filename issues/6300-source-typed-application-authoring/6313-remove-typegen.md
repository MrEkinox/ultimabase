# 6313: Remove Typegen and generated application registries

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/typegen`, `@ultimabase/core`, repository tooling and consumers
- Depends on: 6312
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Delete Typegen once every current application contract is source typed, without
moving equivalent generation machinery, global augmentation, or stale artifact
checks into another package.

## Acceptance criteria

- [ ] The `@ultimabase/typegen` workspace, public exports, dependencies, build steps, generator, loader, snapshot, fingerprint, and emitted application declaration paths are removed.
- [ ] Core generated-registry merge targets and generated class/model/handle lookups are removed after their last consumer migrates.
- [ ] Plugin manifests and declarations no longer carry unused Typegen privileges, references, descriptors, snapshots, or inspection projections.
- [ ] Create App, examples, testing helpers, package scripts, CI selection, archives, and website instructions require no generation command or generated file.
- [ ] Clean TypeScript and JavaScript projects start, typecheck, build, package, and run from source declarations alone.
- [ ] Removing or reconfiguring a plugin immediately changes source completions and diagnostics without regeneration or stale cache state.
- [ ] No ambient per-application global registry, compiler plugin, generated client, or compatibility package replaces Typegen.
- [ ] Package and lockfile removal is complete and public package indexes are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Clean checkout/source and packed-package projects with no generated files.
- [ ] Removed package/export/dependency and stale-artifact absence guards.
- [ ] Full editor-contract migration with equal or stronger assertions.
- [ ] Locked TypeScript performance, memory, and declaration-size budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and a complete package/import/export/script/generated-artifact/fixture/documentation consumer inventory before deletion.
- [ ] Audit the complete diff for surviving Typegen machinery, moved generation logic, lost editor assertions, stale artifacts, package/lockfile leaks, weakened clean-checkout behavior, declaration growth, and deleted retained tests.
- [ ] Record each finding and correction in the handoff; rerun removal searches, source/packed/editor/budget checks, and the complete audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; absence tests never substitute for proving retained source-typed behavior.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- OpenAPI, SDK, transport schema, or client generation.
- A deprecated Typegen compatibility package.
- Runtime source rewriting or a TypeScript compiler plugin.
