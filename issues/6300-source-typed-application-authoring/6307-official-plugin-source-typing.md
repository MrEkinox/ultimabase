# 6307: Migrate Access, Hooks, and Validation source typing

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/validation-plugin`
- Depends on: 6306
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate the three schema-callback verticals to the source-type projection
contract while preserving their exact policy, lifecycle, validation, provider,
and editor semantics without package-specific bridges.

## Acceptance criteria

- [ ] Access and Hooks infer exact schema items, fields, filters, operations, plugin mutation keys, and callback documentation from source.
- [ ] Access preserves default denial, operation and mutation rules, row filters, item checks, field restrictions, relation writes, protected output narrowing, diagnostics, compatible providers, and Master bypass.
- [ ] Hooks preserves field/schema/global order, transaction timing, plugin mutation phases, callback attribution, cancellation, events, diagnostics, and compatible providers.
- [ ] Validation preserves Standard Schema compatibility, final-input timing, arithmetic projection, rejection-only semantics, nested values, and absence from result/read boundaries.
- [ ] Multiple explicit instances, dependencies, compatible community providers, direct options, field options, and plugin-absence diagnostics remain exact.
- [ ] No official package uses a private Core import or a capability unavailable to an equivalent community plugin.
- [ ] Superseded per-plugin Typegen descriptors and compatibility branches are removed as each package migrates.
- [ ] Package READMEs, examples, and public documentation are updated in each affected package change.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Existing unit, type, editor, E2E, PostgreSQL E2E, security, and conformance suites migrate without dropped assertions.
- [ ] Source and packed no-generated-artifact applications cover Access, Hooks, Validation, absence, and compatible providers.
- [ ] Locked TypeScript performance and memory budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and one explicit capability/test/documentation inventory for Access, Hooks, Validation, and each compatible-provider boundary.
- [ ] Audit the complete diff plugin by plugin for policy broadening, callback reorder, validation replay or transformation, private Core access, per-plugin bridges, duplicate declarations, instance/order changes, stale Typegen, missing packed/source assertions, and postponed documentation.
- [ ] Record each finding and correction in the handoff; rerun the affected plugin vertical plus the complete cross-plugin audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no plugin may be declared migrated while one retained assertion or integration is absent or red.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- ACL, Roles, Password Auth, Soft Delete, vector, database, transport, and application-only plugin migration.
- Adding a new plugin or weakening a plugin contract to fit the new type system.
- Keeping a plugin-specific generated declaration fallback.
