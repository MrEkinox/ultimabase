# 904: Verify generated and PostgreSQL mutation include DX

- Status: planned
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Depends on: 903
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Prove the complete developer-visible mutation include contract against source,
generated declarations, packed exports, Runtime, and PostgreSQL.

## Acceptance criteria

- [ ] Source and packed-package autocomplete expose `include` on all four commands.
- [ ] Hover types contain compact generated names rather than schema inference internals.
- [ ] Public documentation shows singular and collection examples and query costs.
- [ ] Existing read inclusion, selection, Access, hook, and transaction behavior does not regress.
- [ ] The milestone plan records final validation evidence.

## Tests

- [ ] Focused TypeScript language-service regression tests pass.
- [ ] Core, codegen, PostgreSQL, and cross-package E2E suites pass.
- [ ] Repository typecheck, test, lint, constraints, and build pass.

## Out of scope

- Transport-specific GraphQL or REST mutation syntax.
- Benchmarks beyond proving grouped collection query cardinality.
