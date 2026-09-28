# 6312: Migrate Plugin Kit, testing, and community conformance

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/plugin-kit`, `@ultimabase/testing`, repository plugin fixtures
- Depends on: 6311
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Prove that community plugins can expose every current contribution through the
same Core-native source-typed contract, with Plugin Kit remaining optional and
testing helpers remaining representative rather than privileged.

## Acceptance criteria

- [ ] Plugin Kit helpers remove duplication over the Core-native declaration contract but do not create a second contract, registry, lifecycle, ownership, privilege, or type-projection path.
- [ ] A plugin written without Plugin Kit retains the same supported manifest, identity, dependencies, peers, privileges, claims, capabilities, contributions, resources, setup, cleanup, and source-typing powers.
- [ ] Conformance covers fields, options, immutable patches, operations, schema mutations, model surfaces, middleware, protected constraints, persistence-plan rewrites, exact instances, conflicts, order, and application-lifetime resources.
- [ ] Removed generic decoration, replacement, observer, Query-extension, destructive-patch, arbitrary schema/model-operation, and manual Typegen powers remain rejected.
- [ ] Testing helpers construct only public contracts, support configured factories, source and packed modules, JavaScript, multiple instances, lifecycle failures, and deterministic cleanup.
- [ ] Representative community fixtures need no deep import, cast, plugin-owned ambient augmentation, generated plugin declaration, official-plugin identity, or package-specific Core exception.
- [ ] Superseded Plugin Kit, testing, fixture, and Typegen paths are removed.
- [ ] Plugin-author READMEs, examples, conformance guidance, and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Core-only and Plugin Kit community-plugin conformance matrices with equivalent Runtime and editor assertions.
- [ ] Source, packed, JavaScript, multiple-instance, privilege, conflict, lifecycle, and removed-power regressions.
- [ ] Locked TypeScript performance, memory, and declaration-size budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every Plugin Kit helper, testing shortcut, community fixture, conformance guarantee, and removed-power guard.
- [ ] Audit the complete diff for hidden official privileges, Core dependency reversal, duplicate contracts, weaker community capabilities, deep imports, casts, ambient leakage, missing negative tests, stale Typegen, and documentation drift.
- [ ] Record each finding and correction in the handoff; rerun both Core-native and Plugin Kit conformance matrices plus the complete plugin-author audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; official-plugin success cannot substitute for community-plugin parity.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- New plugin powers or a new official plugin.
- Making Plugin Kit mandatory.
- Restoring a power removed by ADR-0259.
