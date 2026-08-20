# 1503: Prove no-Hooks and alternative-Hooks applications

- Status: completed
- Milestone: 15
- Packages: `@ultimabase/core`, `@ultimabase/hooks-plugin`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 1501
- ADR: ADR-0189, ADR-0194, ADR-0202

## Goal

Prove Hooks is an optional product and a community engine can offer a different
DX through the same public kernel.

## Acceptance criteria

- [x] One TypeScript and one JavaScript application execute CRUD and transactions without hooks-plugin or hook placeholders.
- [x] A minimal alternative behavior engine contributes a different schema or fluent DX, Runtime middleware, transaction integration, Typegen contracts, and diagnostics using only public APIs.
- [x] The alternative owns its protocol identity without importing or installing the official implementation.
- [x] Official-compatible extensions import hooks-plugin contracts, while independent alternatives are not forced into the official singleton.
- [x] Shared low-level plugin middleware can operate without depending on the official engine.
- [x] Source, generated, packed, and inspection surfaces contain no implicit official Hooks dependency in no-Hooks applications.

## Tests

- [x] Conformance, language-service, Runtime, packed, PostgreSQL, cleanup, and application-isolation suites cover no engine, official engine, and an independent alternative engine.

## Implementation evidence

- `optional-hooks-engines.e2e.test.ts` proves the no-engine graph, the official
  peer boundary, the independent alternative, Typegen, language-service
  inference, generic middleware, conformance, cleanup, and application-local
  Runtime state through built public exports.
- `optional-hooks-engines.postgres.e2e.test.ts` executes TypeScript and
  JavaScript CRUD plus explicit commit and rollback paths without Hooks, then
  proves the alternative engine's nested audit writes and diagnostics share the
  originating PostgreSQL transaction.
- `package-archives.e2e.test.ts` checks the packed Core manifest,
  implementation, declarations, and source map contain no dependency on the
  official Hooks package.
- The alternative fixture imports only public package roots, owns the
  `fixture.alternative-behavior.diagnostics` protocol, exposes an extension-
  based DX, and is deliberately not published.

## Out of scope

- Publishing the alternative engine.
- Access extraction.
