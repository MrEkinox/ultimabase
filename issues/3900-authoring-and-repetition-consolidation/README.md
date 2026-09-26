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
- [ ] Reduce built-in scalar factory typing only with identical source and
      compiled hovers.
- [ ] Consolidate remaining internal scalar mappings and plugin registries.
- [ ] Run the complete parity and reduction audit.

No push is authorized.
