# Milestone 39 — Authoring and repetition consolidation

- Status: in-progress
- Authorization: user request of 2026-09-25
- Baseline: `776b533c`

This milestone continues debt and DX reduction without removing a functional
capability. Each retained change must remove more production or repeated test
work than it adds, preserve public inference and diagnostics, and compile into
one existing Core boundary rather than introduce a parallel facade.

## Execution order

- [x] [3901 — Unify plugin field-family authoring](3901-plugin-field-family.md)
- [x] [3902 — Consolidate prepared-mutation test adapters](3902-prepared-mutation-test-adapters.md)
- [x] [3903 — Preserve scalar hovers and consolidate GraphQL scalar mappings](3903-graphql-scalar-mappings.md)
- [x] [3904 — Consolidate structured plugin identity maps](3904-structured-plugin-identity-map.md)
- [ ] Run the complete parity and reduction audit.

No push is authorized.
