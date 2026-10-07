# Milestone 57 — Runtime boundary regression repair

- Status: completed
- Authorization: user request of 2026-09-27
- Baseline: `270d60b9`

The complete coverage gate found two source-mode PostgreSQL E2E regressions
introduced by earlier behavior-preserving refactors. This milestone restores
the existing nested-write, ACL, inclusion, and virtual-field capabilities and
makes the complete coverage gate mandatory for future debt-reduction work.

## Execution order

- [x] [5701 — Restore Runtime boundary snapshots](5701-restore-runtime-boundary-snapshots.md)

## Outcome

The existing public verticals remain unchanged and now pass again. Hooks keeps
Core's validated snapshots instead of replacing them with metadata-losing
generic copies, while Access validates complete native outcomes only for the
upsert materializations it consumes. The repository agent contract now requires
the complete coverage gate before any debt-reduction refactor is completed or
committed.

No push is authorized.
