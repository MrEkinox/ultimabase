# Milestone 40 — Command and declaration simplification

- Status: completed
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
- [x] [4003 — Compile declaration privilege access once](4003-declaration-privilege-access.md)
- [x] [4004 — Simplify schema declaration staging](4004-schema-declaration-staging.md)
- [x] [4005 — Complete parity and reduction audit](4005-parity-and-reduction-audit.md)

## Outcome

Milestone 40 removed 98 handwritten production TypeScript lines while retaining
every public plugin factory, capability, privilege, declaration surface,
diagnostic, lifecycle, transport, Typegen, and schema behavior. Shared command,
exact-object validation, declaration privilege, and schema source mechanics now
have one internal owner instead of parallel implementations.

The complete audit, category line counts, validation evidence, honest DX
assessment, and remaining safe opportunities are recorded in issue 4005.

No push is authorized.
