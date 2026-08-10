# 904: Verify generated and PostgreSQL mutation include DX

- Status: done
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Depends on: 903
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Prove the complete developer-visible mutation include contract against source,
generated declarations, packed exports, Runtime, and PostgreSQL.

## Acceptance criteria

- [x] Source and packed-package autocomplete expose `include` on all four commands.
- [x] Hover types contain compact generated names rather than schema inference internals.
- [x] Root and nested mutation projections expose implicit `id` values and reject `id: false`.
- [x] Public documentation shows singular and collection examples and query costs.
- [x] Existing read inclusion, selection, Access, hook, and transaction behavior does not regress.
- [x] The milestone plan records final validation evidence.

## Tests

- [x] Focused TypeScript language-service regression tests pass.
- [x] Core, codegen, PostgreSQL, and cross-package E2E suites pass.
- [x] Repository typecheck, test, lint, constraints, and build pass.

## Validation evidence

- Core: 195 files and 1,394 tests pass with no type errors.
- Repository unit and type suites: 279 files and 1,751 tests pass.
- Packed package checks: 5 files and 50 tests pass.
- Cross-package and PostgreSQL E2E: 25 files and 127 tests pass.
- The focused PostgreSQL projection scenario observes one singular projection
  read, one grouped create projection read, three grouped update reads including
  two item target locks, restored declaration order, and transactional rollback.
- `yarn typecheck`, `yarn lint`, `yarn constraints`, `yarn format:check`, and
  `yarn build` pass.

## Out of scope

- Transport-specific GraphQL or REST mutation syntax.
- Benchmarks beyond proving grouped collection query cardinality.
