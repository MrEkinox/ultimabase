# Milestone 41 — Runtime and resource simplification

- Status: in-progress
- Authorization: user request of 2026-09-26
- Baseline: `38b1ca57`

This milestone continues repository-wide debt and DX reduction without removing
any functional capability. It first consolidates repeated Core decisions and
native resource cleanup, then proceeds to larger Query and PostgreSQL mechanics
only when the existing architecture can be retained directly.

Every implementation issue must produce a net reduction in its targeted
handwritten source category, preserve exact public inference and diagnostics,
and avoid a compatibility bridge or generic registry.

## Execution order

- [x] [4101 — Consolidate operation execution selection](4101-operation-execution-selection.md)
- [ ] [4102 — Centralize operation characteristics](4102-operation-characteristics.md)
- [ ] [4103 — Centralize enumerable-key validation](4103-enumerable-key-validation.md)
- [ ] [4104 — Adopt native asynchronous test disposal](4104-native-test-disposal.md)
- [ ] [4105 — Consolidate captured builder calls](4105-captured-builder-calls.md)
- [ ] [4106 — Consolidate Query clause application](4106-query-clause-application.md)
- [ ] [4107 — Consolidate PostgreSQL targeted mutation planning](4107-postgres-targeted-mutation-planning.md)
- [ ] [4108 — Complete parity and reduction audit](4108-parity-and-reduction-audit.md)

If issues 4106 or 4107 require changing a public representation, Runtime order,
transaction semantics, or adapter boundary, implementation stops for an
architecture decision.

No push is authorized.
