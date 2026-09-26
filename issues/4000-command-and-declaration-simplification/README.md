# Milestone 40 — Command and declaration simplification

- Status: in-progress
- Authorization: user request of 2026-09-26
- Baseline: `aa2f0097`

This milestone continues debt and plugin-authoring DX reduction without
removing a functional capability. Public operation and schema-mutation APIs
remain distinct, while repeated private validation, compilation, privilege,
and schema-declaration mechanics converge on their existing canonical Core
boundaries.

Each implementation issue must reduce handwritten production code, preserve
exact diagnostics and public inference, and avoid introducing a generic public
registry or compatibility bridge.

## Execution order

- [x] [4001 — Consolidate native command contribution mechanics](4001-native-command-contribution-mechanics.md)
- [x] [4002 — Centralize exact object option validation](4002-exact-object-option-validation.md)
- [ ] [4003 — Compile declaration privilege access once](4003-declaration-privilege-access.md)
- [ ] [4004 — Simplify schema declaration staging](4004-schema-declaration-staging.md)
- [ ] [4005 — Complete parity and reduction audit](4005-parity-and-reduction-audit.md)

No push is authorized.
