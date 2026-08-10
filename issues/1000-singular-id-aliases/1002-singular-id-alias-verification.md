# 1002: Verify generated and packed identifier alias DX

- Status: done
- Milestone: 10
- Packages: `@ultimabase/core`, `@ultimabase/codegen`
- Depends on: 1001
- ADR: [ADR-0182](../../docs/adr/0182-singular-id-target-aliases.md)

## Goal

Protect the concise identifier mutation form through generated application
contracts, source declarations, built package exports, and public examples.

## Acceptance criteria

- [x] `id` and `where` autocomplete on `updateOne` and `deleteOne` without exposing schema inference internals.
- [x] Hover types remain compact and use generated contract names.
- [x] Literal `select` and `include` inference remains exact for the `id` form.
- [x] Source and packed declarations reject simultaneous `id` and `where` targets.
- [x] Core and Codegen documentation show the alias and its canonical equivalence.
- [x] The milestone plan records final validation evidence.

## Tests

- [x] Source language-service tests cover completions, hovers, and result inference.
- [x] Packed-package language-service tests cover the generated consumer boundary.
- [x] Repository typecheck, test, lint, constraints, formatting, build, and relevant E2E checks pass.

## Validation evidence

- Core: 195 files and 1,395 tests pass with no type errors.
- Repository unit and type suites: 279 files and 1,752 tests pass.
- Packed package checks: 5 files and 50 tests pass.
- Focused source codegen language-service checks: 5 tests pass.
- The packed codegen E2E proves target completions, compact generated hovers,
  exact identifier projections, and mutual exclusion through built exports.
- `yarn typecheck`, `yarn lint`, `yarn constraints`, `yarn format:check`, and
  `yarn build` pass.
- The PostgreSQL scenario now exercises both aliases, but its focused local run
  could not start because no container runtime is available. CI remains the
  execution gate for that scenario.

## Out of scope

- New generated input aliases beyond the existing schema contract.
- REST or GraphQL transport exposure.
- Benchmarks for a normalization-only alias.
