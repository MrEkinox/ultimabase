# 1103: Verify source and packed Typegen DX

- Status: planned
- Milestone: 11
- Packages: `@ultimabase/typegen`, repository E2E
- Depends on: 1102
- ADR: [ADR-0184](../../docs/adr/0184-typegen-package-identity.md)

## Goal

Prove that the renamed package works through source declarations, built exports,
automatic application startup, and a clean consumer without the former name.

## Acceptance criteria

- [ ] Source completions and hovers expose `typegenPlugin()` and precise Typegen option names.
- [ ] Packed exports expose only the new package and public API names.
- [ ] The Todo backend regenerates its declaration during startup through `@ultimabase/typegen`.
- [ ] First generation, stale fingerprints, plugin field methods, and atomic writes retain their existing behavior.
- [ ] The generated banner and diagnostics consistently reference the new package.
- [ ] The completed milestone plan records final validation evidence.

## Tests

- [ ] Focused Typegen language-service tests pass against source and packed exports.
- [ ] Package archive and generated-application E2E tests pass.
- [ ] Repository typecheck, test, lint, constraints, formatting, and build pass.

## Out of scope

- Publishing either package to npm.
- A compatibility migration test for `@ultimabase/codegen`.
- New CLI functionality.
