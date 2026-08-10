# 1103: Verify source and packed Typegen DX

- Status: completed
- Milestone: 11
- Packages: `@ultimabase/typegen`, repository E2E
- Depends on: 1102
- ADR: [ADR-0184](../../docs/adr/0184-typegen-package-identity.md)

## Goal

Prove that the renamed package works through source declarations, built exports,
automatic application startup, and a clean consumer without the former name.

## Acceptance criteria

- [x] Source completions and hovers expose `typegenPlugin()` and precise Typegen option names.
- [x] Packed exports expose only the new package and public API names.
- [x] The Todo backend regenerates its declaration during startup through `@ultimabase/typegen`.
- [x] First generation, stale fingerprints, plugin field methods, and atomic writes retain their existing behavior.
- [x] The generated banner and diagnostics consistently reference the new package.
- [x] The completed milestone plan records final validation evidence.

## Tests

- [x] Focused Typegen language-service tests pass against source and packed exports.
- [x] Package archive and generated-application E2E tests pass.
- [x] Repository typecheck, test, lint, constraints, formatting, and build pass.

## Out of scope

- Publishing either package to npm.
- A compatibility migration test for `@ultimabase/codegen`.
- New CLI functionality.

## Validation evidence

- The Typegen package suite passes with 7 files and 21 tests, including source
  completion and hover checks for `typegenPlugin()` and its options.
- Packed-package validation passes with 5 files and 52 tests. It proves the new
  runtime export, the absence of `codegenPlugin`, precise packed Typegen hovers,
  and automatic Todo declaration generation.
- The committed Todo declaration exactly matches a fresh startup generation and
  carries the `@ultimabase/typegen` banner and current fingerprint.
- Repository build, typecheck, 279-file/1,752-test suite, lint, constraints, and
  formatting all pass.
