# Completed plan: pre-feature codebase consolidation

- Status: complete
- Started: 2026-08-10
- Completed: 2026-08-11
- Objective owner: repository documentation, `@ultimabase/core`
- Milestone: [12 — Pre-feature codebase consolidation](../../../issues/1200-maintenance-consolidation/README.md)
- Paused objectives:
  - [ACL hardening and developer-experience consolidation](../paused/acl-hardening-and-developer-experience-consolidation.md)
  - [Generated schema authoring and type contracts](generated-schema-authoring-and-type-contracts.md)

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
- Public builders, schema models, Access, hooks, transaction order, operation AST, and adapter contracts retain their behavior except for the explicitly removed Query aliases.
- Internal extractions protect a current responsibility or remove duplication across current concrete usages; file size alone is not sufficient justification.
- No `any`, deep package import, infrastructure dependency in Core, or speculative extension point is introduced.
- Every issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

1. [x] [1201 — Reconcile active planning metadata](../../../issues/1200-maintenance-consolidation/1201-reconcile-active-planning-metadata.md)
2. [x] [1202 — Remove empty publishable plugin shells](../../../issues/1200-maintenance-consolidation/1202-remove-empty-plugin-package-shells.md)
3. [x] [1203 — Reject unknown built-in field options](../../../issues/1200-maintenance-consolidation/1203-reject-unknown-schema-field-options.md)
4. [x] [1204 — Align static and runtime reserved field names](../../../issues/1200-maintenance-consolidation/1204-align-reserved-schema-field-names.md)
5. [x] [1205 — Improve invalid field-option diagnostics](../../../issues/1200-maintenance-consolidation/1205-improve-field-option-diagnostics.md)
6. [x] [1206 — Remove deprecated Query compatibility aliases](../../../issues/1200-maintenance-consolidation/1206-remove-deprecated-query-aliases.md)
7. [x] [1207 — Centralize guarded Query-expression traversal](../../../issues/1200-maintenance-consolidation/1207-centralize-query-expression-traversal.md)
8. [x] [1208 — Separate schema-model contracts from runtime materialization](../../../issues/1200-maintenance-consolidation/1208-separate-schema-model-contracts-and-runtime.md)
9. [x] [1209 — Decompose Runtime pipeline orchestration](../../../issues/1200-maintenance-consolidation/1209-decompose-runtime-pipeline-orchestration.md)
10. [x] [1210 — Decompose native Access dispatch responsibilities](../../../issues/1200-maintenance-consolidation/1210-decompose-native-access-dispatcher.md)
11. [x] [1211 — Verify the maintenance consolidation](../../../issues/1200-maintenance-consolidation/1211-verify-maintenance-consolidation.md)

## Intentional remaining hotspots

- Query filtering and the immutable public Query builder remain substantial
  because they own one exact typed vocabulary and one transport-neutral AST.
  This plan extracted the duplicated guarded traversal but does not split the
  public contract or invent another intermediate representation.
- Runtime validation, hooks, and enforcement remain native Core domains with
  central ordered coordinators. Focused helpers now own concrete algorithms,
  while the coordinators deliberately retain the accepted lifecycle order and
  application-local composition state.
- ACL cleanup and role hardening remain untouched. Their concrete continuation
  belongs to the paused ACL plan at issue 432 rather than to a maintenance
  refactor driven by file size or aggregate coverage.
- Typegen editor-performance verification remains owned by paused issue 810.
  No caching, worker, declaration split, or other optimization is anticipated
  without its measurements.

## Final validation

- All nine publishable workspaces contain implementation source, relevant
  tests, and build and test scripts; planned packages have no empty workspace.
- Strict field options, reserved names, actionable diagnostics, removed Query
  aliases, exact canonical inference, and internal extraction boundaries are
  protected in source and packed TypeScript consumers.
- The 52 production files touched by the plan introduce no explicit `any` or
  deep package import. Double assertions decrease from 58 to 35.
- Repository unit and type suites: 286 files, 1,813 tests, no type errors.
- Coverage: 90.46% statements, 83.65% branches, 94.21% functions, and 90.61%
  lines, with focused suites over every changed responsibility.
- Packed packages: 7 files, 47 tests.
- Complete built cross-package and PostgreSQL E2E: 27 files, 124 tests.
- Constraints, typecheck, lint, formatting, build, and Changesets validation
  all pass.
