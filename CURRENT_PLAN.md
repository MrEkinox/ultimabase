# Active plan: pre-feature codebase consolidation

- Status: active
- Started: 2026-08-10
- Objective owner: repository documentation, `@ultimabase/core`
- Milestone: [12 — Pre-feature codebase consolidation](issues/1200-maintenance-consolidation/README.md)
- Paused objectives:
  - [ACL hardening and developer-experience consolidation](docs/plans/paused/acl-hardening-and-developer-experience-consolidation.md)
  - [Generated schema authoring and type contracts](docs/plans/paused/generated-schema-authoring-and-type-contracts.md)

## Objective

Consolidate the verified repository, Schema, Query, Runtime, and native Access
maintenance debt before adding another product capability. The objective keeps
every accepted architecture and public execution semantic while making current
contracts stricter, removing obsolete pre-release surface, and separating
central implementation responsibilities into focused internal modules.

## Frozen constraints

- No ACL permission, ACL PostgreSQL, role-reference cleanup, or ACL concurrency behavior changes.
- The paused ACL plan remains resumable at issue 432 and is not advanced by this objective.
- Typegen performance verification issue 810 remains paused and is not implemented here.
- No REST, GraphQL, authentication, migrations, SDK, CLI, database, or other product capability is added.
- `Schema -> Query / Operation AST -> AccessPlan / Runtime -> DatabaseAdapter` remains unchanged.
- Core retains its accepted Schema, Query, Access, application, and Runtime domains in one package.
- Public builders, schema models, Access, hooks, transaction order, operation AST, and adapter contracts retain their behavior unless an issue explicitly removes a named deprecated alias.
- Internal extractions must protect a current responsibility or remove duplication across current concrete usages; file size alone is not sufficient justification.
- No `any`, deep package import, infrastructure dependency in Core, or speculative extension point is introduced.
- Every issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

### Phase 1 — Repository truth

1. [ ] [1201 — Reconcile active planning metadata](issues/1200-maintenance-consolidation/1201-reconcile-active-planning-metadata.md)
2. [ ] [1202 — Remove empty publishable plugin shells](issues/1200-maintenance-consolidation/1202-remove-empty-plugin-package-shells.md)

### Phase 2 — Schema and public API hardening

3. [ ] [1203 — Reject unknown built-in field options](issues/1200-maintenance-consolidation/1203-reject-unknown-schema-field-options.md)
4. [ ] [1204 — Align static and runtime reserved field names](issues/1200-maintenance-consolidation/1204-align-reserved-schema-field-names.md)
5. [ ] [1205 — Improve invalid field-option diagnostics](issues/1200-maintenance-consolidation/1205-improve-field-option-diagnostics.md)
6. [ ] [1206 — Remove deprecated Query compatibility aliases](issues/1200-maintenance-consolidation/1206-remove-deprecated-query-aliases.md)

### Phase 3 — Focused Core internals

7. [ ] [1207 — Centralize guarded Query-expression traversal](issues/1200-maintenance-consolidation/1207-centralize-query-expression-traversal.md)
8. [ ] [1208 — Separate schema-model contracts from runtime materialization](issues/1200-maintenance-consolidation/1208-separate-schema-model-contracts-and-runtime.md)
9. [ ] [1209 — Decompose Runtime pipeline orchestration](issues/1200-maintenance-consolidation/1209-decompose-runtime-pipeline-orchestration.md)
10. [ ] [1210 — Decompose native Access dispatch responsibilities](issues/1200-maintenance-consolidation/1210-decompose-native-access-dispatcher.md)

### Phase 4 — Complete proof

11. [ ] [1211 — Verify the maintenance consolidation](issues/1200-maintenance-consolidation/1211-verify-maintenance-consolidation.md)

## Supervision checkpoints

- After 1201: present the remaining active, paused, and completed plan references and prove that each points to the correct owner.
- After 1202: show that every remaining publishable workspace contains implemented behavior and that planned package identities remain issue-tracked.
- During 1203 through 1205: stop if strict validation or improved diagnostics require a new field syntax or reject a documented supported contract.
- After 1206: demonstrate through source and packed exports that the three deprecated aliases are absent and canonical replacements remain precise.
- After 1207: show one guarded internal traversal reused by current Access and Enforcement consumers without widening the public Query AST.
- During 1208 through 1210: stop before any public API, Runtime order, authority, hook, transaction, adapter, or ACL behavior change.
- After 1210: demonstrate unchanged native Access decisions, field transitions, output restrictions, and master semantics with no edit to ACL packages.
- After 1211: report full source, packed, and PostgreSQL E2E evidence and archive this plan only when every issue is done.

## Completion gate

- Live roadmap, milestone, issue-status, package, and plan documentation describe the current repository without broken active-plan links.
- Empty publishable package shells no longer participate in workspace builds, tests, archives, or dependency installation.
- Built-in field declarations reject unsupported root and nested options at runtime, and static/runtime reserved names agree.
- Invalid field combinations produce actionable TypeScript diagnostics instead of misleading arity failures.
- `SchemaWhereFactory`, `QueryIncludedPointerFromInput`, and `OperationIncludedPointer` are absent from source and packed public exports.
- Query expression traversal, schema-model runtime behavior, Runtime orchestration, and native Access dispatch have focused internal ownership without changing public behavior.
- Remaining double assertions in touched boundaries are justified by explicit invariants and focused tests, and no touched production area increases its assertion count.
- Repository typecheck, unit/type tests, lint, formatting, constraints, build, packed archives, and complete PostgreSQL E2E pass.
