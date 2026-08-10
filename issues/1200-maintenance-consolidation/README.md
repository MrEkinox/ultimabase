# Milestone 12 — Pre-feature codebase consolidation

Resolve verified repository, Schema, Query, Runtime, and native Access
maintenance debt before another product feature begins. This milestone changes
no product capability and preserves the accepted foundational architecture.

ACL hardening and Typegen performance verification remain explicitly paused.
The Core work is limited to strict existing boundaries, direct pre-release API
cleanup, and focused internal responsibility splits.

## Execution order

1. [1201 — Reconcile active planning metadata](1201-reconcile-active-planning-metadata.md)
2. [1202 — Remove empty publishable plugin shells](1202-remove-empty-plugin-package-shells.md)
3. [1203 — Reject unknown built-in field options](1203-reject-unknown-schema-field-options.md)
4. [1204 — Align static and runtime reserved field names](1204-align-reserved-schema-field-names.md)
5. [1205 — Improve invalid field-option diagnostics](1205-improve-field-option-diagnostics.md)
6. [1206 — Remove deprecated Query compatibility aliases](1206-remove-deprecated-query-aliases.md)
7. [1207 — Centralize guarded Query-expression traversal](1207-centralize-query-expression-traversal.md)
8. [1208 — Separate schema-model contracts from runtime materialization](1208-separate-schema-model-contracts-and-runtime.md)
9. [1209 — Decompose Runtime pipeline orchestration](1209-decompose-runtime-pipeline-orchestration.md)
10. [1210 — Decompose native Access dispatch responsibilities](1210-decompose-native-access-dispatcher.md)
11. [1211 — Verify the maintenance consolidation](1211-verify-maintenance-consolidation.md)

The active constraints, pause boundaries, and supervision checkpoints live in
[`CURRENT_PLAN.md`](../../CURRENT_PLAN.md).
