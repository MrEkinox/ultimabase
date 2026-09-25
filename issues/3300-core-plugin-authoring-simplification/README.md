# Milestone 33 — Simplify Core-native plugin authoring

- Status: in-progress
- Authorization: user request of 2026-09-25
- ADR: ADR-0269

The target is one Core-native authoring path that preserves the complete open
plugin kernel without asking an author to reproduce Core's compilation and
materialization phases. Plugin Kit remains optional and owns only higher-level
patterns that are not foundational plugin registration.

## Execution order

- [x] [3301 — Introduce the Core plugin factory and compact public type](3301-core-plugin-factory.md)
- [x] [3302 — Flatten capability authoring](3302-flat-capability-authoring.md)
- [x] [3303 — Unify application-operation contributions](3303-operation-contributions.md)
- [x] [3304 — Remove redundant static registrations](3304-static-registration-deduplication.md)
- [x] [3305 — Migrate official plugins and shrink Plugin Kit](3305-official-plugin-migration.md)
- [ ] [3306 — Audit behavioral and authoring parity](3306-parity-audit.md)

Every issue must compare the before/after authoring shape and prove that the
compiled graph, privilege report, capability inventory, lifecycle ordering,
setup exports, transport allowlists, Typegen output, and Runtime behavior remain
equivalent. No compatibility alias or second public authoring path remains at
milestone completion.
