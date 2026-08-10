# 1002: Verify generated and packed identifier alias DX

- Status: planned
- Milestone: 10
- Packages: `@ultimabase/core`, `@ultimabase/codegen`
- Depends on: 1001
- ADR: [ADR-0182](../../docs/adr/0182-singular-id-target-aliases.md)

## Goal

Protect the concise identifier mutation form through generated application
contracts, source declarations, built package exports, and public examples.

## Acceptance criteria

- [ ] `id` and `where` autocomplete on `updateOne` and `deleteOne` without exposing schema inference internals.
- [ ] Hover types remain compact and use generated contract names.
- [ ] Literal `select` and `include` inference remains exact for the `id` form.
- [ ] Source and packed declarations reject simultaneous `id` and `where` targets.
- [ ] Core and Codegen documentation show the alias and its canonical equivalence.
- [ ] The milestone plan records final validation evidence.

## Tests

- [ ] Source language-service tests cover completions, hovers, and result inference.
- [ ] Packed-package language-service tests cover the generated consumer boundary.
- [ ] Repository typecheck, test, lint, constraints, formatting, build, and relevant E2E checks pass.

## Out of scope

- New generated input aliases beyond the existing schema contract.
- REST or GraphQL transport exposure.
- Benchmarks for a normalization-only alias.
