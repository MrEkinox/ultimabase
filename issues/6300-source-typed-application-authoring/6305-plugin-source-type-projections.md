# 6305: Project plugin authoring types without Typegen

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, plugin authoring contracts
- Depends on: 6304
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Let one static plugin definition project its exact fields, options, operations,
schema mutations, and model surfaces into `App.Schema` without generated output
or a second author-maintained registry.

## Acceptance criteria

- [ ] Core exposes one plugin-neutral source-type projection contract carried by static plugin definitions.
- [ ] Core does not import Plugin Kit or a concrete plugin; Plugin Kit remains optional convenience over the same native boundary.
- [ ] One plugin declaration is the source for Runtime ownership/provenance and TypeScript authoring; authors do not repeat names or shapes in a separate Typegen descriptor.
- [ ] Root, embedded, virtual, and output field families; field and schema options; application operations; schema mutations; model commands; and plugin-owned schemas retain their current supported distinctions.
- [ ] Installed plugins add exact surfaces to only their configured application; absent plugins add nothing.
- [ ] Multiple explicit instances remain legal and ambiguous local configuration fails deterministically.
- [ ] Option and method conflicts, reserved names, missing privileges, unsupported targets, and incompatible requirements retain focused diagnostics.
- [ ] Direct schema options configure installed plugins but never install or order them.
- [ ] No `Schema.use()`, ambient application augmentation, plugin map, nested plugin, or automatic registration is introduced.
- [ ] Public plugin-author documentation and conformance helpers are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Core-native and Plugin Kit community-plugin conformance fixtures.
- [ ] Exact option, field, command, instance, and absence editor contracts.
- [ ] Runtime provenance, privilege, order, collision, and cleanup regressions.
- [ ] Source and packed-package language-service tests.
- [ ] Locked TypeScript performance and memory budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and map every retained plugin contribution/type descriptor and current official/community consumer before replacement.
- [ ] Audit the complete diff for duplicated Runtime/type declarations, Core-to-plugin dependency reversal, ambient leakage, instance ambiguity, lost provenance/privilege checks, speculative generic machinery, stale Typegen paths, and editor/performance regressions.
- [ ] Record each finding and correction in the handoff; rerun affected conformance, editor, budget, and complete audits until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no fallback registry, cast, deep import, or plugin-specific exception may bypass the failure.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Special treatment for official plugin package identities.
- Raw TypeScript declaration emission.
- A general higher-kinded-type API exposed to application developers.
