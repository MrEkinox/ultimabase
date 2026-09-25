# Milestone 37 — Capability host simplification

- Status: completed
- Authorization: user request of 2026-09-25
- Baseline: `03397a6c1d8bb0c10d85bbedc4a116492bc9e5f2`

This milestone continues the native-model reduction rule inside Core's
application capability host. It removes parallel materialization state,
repeated plan scans, and duplicated cleanup traversal while preserving the
accepted capability graph, privilege, lifecycle, composition, and diagnostic
contracts.

## Execution order

- [x] [3701 — Consolidate capability materialization state](3701-capability-materialization-state.md)

The issue is retained only if production code decreases and focused parity
tests protect application/declaration lifetimes, exact requirement reads,
cycles, composition, provider provenance, and reverse cleanup.

## Final outcome

Core removes 14 production lines while replacing three parallel resolved-state
collections with one, indexing plans by nominal token, and sharing one reverse
resource drain. The complete Core suite and repository typecheck, lint, and
build pass with no public export or declaration change.
