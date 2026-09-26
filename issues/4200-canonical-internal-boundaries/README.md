# Milestone 42 — Canonical internal boundaries

- Status: in progress
- Authorization: user request of 2026-09-26
- Baseline: `e0d0b4d1`

This milestone continues repository-wide debt and DX reduction without removing
any functional capability. It replaces repeated validation and lookup mechanics
with one private canonical boundary only when callers already enforce the same
contract, diagnostics, and ordering.

Every implementation issue must reduce handwritten production code, preserve
public types and exact observable errors, and avoid a compatibility bridge or a
new extension mechanism.

## Execution order

- [x] [4201 — Centralize capability conflict construction](4201-capability-conflict-construction.md)
- [x] [4202 — Centralize normalized update-expression reading](4202-update-expression-reading.md)
- [x] [4203 — Centralize GraphQL compiled-schema lookup](4203-graphql-compiled-schema-lookup.md)
- [ ] [4204 — Complete parity and reduction audit](4204-parity-and-reduction-audit.md)

If any issue would change public inference, error payloads, capability planning,
GraphQL naming, Runtime order, or lifecycle ownership, implementation stops for
an architecture decision.

No push is authorized.
