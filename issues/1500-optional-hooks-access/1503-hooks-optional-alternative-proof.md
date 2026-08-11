# 1503: Prove no-Hooks and alternative-Hooks applications

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/core`, `@ultimabase/hooks-contracts`, `@ultimabase/hooks-plugin`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 1502
- ADR: ADR-0189, ADR-0194

## Goal

Prove Hooks is an optional product and a community engine can offer a different
DX through the same public kernel.

## Acceptance criteria

- [ ] One TypeScript and one JavaScript application execute CRUD and transactions without hooks-plugin or hook placeholders.
- [ ] A minimal alternative behavior engine contributes a different schema or fluent DX, Runtime middleware, transaction integration, Typegen contracts, and diagnostics using only public APIs.
- [ ] The alternative depends on hooks-contracts protocol identity without importing or installing the official implementation.
- [ ] Official and alternative engines provide the same declared `single` capability and conflict before static compilation when installed together.
- [ ] Shared low-level plugin middleware can operate without depending on the official engine.
- [ ] Source, generated, packed, and inspection surfaces contain no implicit official Hooks dependency in no-Hooks applications.

## Tests

- [ ] Conformance, language-service, Runtime, packed, PostgreSQL, cleanup, and application-isolation suites cover no engine, official engine, alternative engine, and conflicting engines.

## Out of scope

- Publishing the alternative engine.
- Access extraction.
