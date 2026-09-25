# Milestone 34 — Contribution-first plugin authoring

- Status: in-progress
- Authorization: user request of 2026-09-25
- ADR: ADR-0270

Milestone 33 removed foundational Plugin Kit indirection but retained Core's
internal phase vocabulary in every plugin definition. This milestone replaces
that shape with one direct `plugin()` factory and one ordered `contributions`
list while preserving the complete open plugin kernel.

## Execution order

- [x] [3401 — Introduce the contribution-first Core factory](3401-contribution-first-core-factory.md)
- [x] [3402 — Prove representative plugin migrations](3402-representative-plugin-migrations.md)
- [x] [3403 — Migrate every production plugin](3403-production-plugin-migration.md)
- [x] [3404 — Remove legacy authoring paths](3404-remove-legacy-authoring.md)
- [ ] [3405 — Audit behavior, documentation, and DX](3405-parity-and-dx-audit.md)

The migration changes authoring form only. Plugin identity and instances,
dependencies and peers, environmental claims, privilege reasons and policy,
capability compatibility and ordering, schema provenance, application
resources, lifecycle order, transport allowlists, Typegen, Runtime behavior,
and deterministic cleanup remain unchanged.
