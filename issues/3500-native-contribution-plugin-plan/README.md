# Milestone 35 — Native contribution-first plugin plan

- Status: in-progress
- Authorization: user request of 2026-09-25
- ADR: ADR-0271

Milestone 34 delivered one contribution-first public API while retaining an
adapter to Core's older internal phase buckets. This milestone makes the same
contribution model native inside Core, removes the adapter, and improves
diagnostics and no-export application resources without changing plugin
capabilities.

## Execution order

- [ ] [3501 — Replace the phase bridge with one native plan](3501-native-plugin-plan.md)
- [ ] [3502 — Prove parity and audit the reduction](3502-parity-and-reduction-audit.md)

The public `plugin()` shape, security model, manifests, graph ordering,
capabilities, declarations, operations, lifecycle semantics, Typegen, and
transports remain authoritative. Line reduction is a consequence of removing
duplicate work, not a reason to weaken validation.
