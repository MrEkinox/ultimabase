# 806: Generate compact application schema types

- Status: done
- Milestone: 8
- Packages: `@ultimabase/codegen`, `@ultimabase/core`
- Depends on: 805
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Generate one deterministic application registry of compact named TypeScript
contracts from the fully resolved static schema and plugin declaration graph.

## Acceptance criteria

- [x] The generator emits model, create, update, where, select, order, include, object-path, pointer-target, relation-target, Access, hook, and FieldBuilder method contracts needed by current public APIs.
- [x] Generated declarations reference shared operator contracts instead of expanding identical recursive conditional types per schema.
- [x] Enum values, list depth, required/defaulted/immutable state, nested objects, pointer and relation targets, and plugin logical values remain exact.
- [x] Output ordering, formatting, identifiers, and content hashes are deterministic across equivalent runs.
- [x] The generator reports schema-name, generated-identity, output-path, and plugin-contribution conflicts with owner information.
- [x] Application configuration and schema sources can be loaded through transpilation before the generated registry exists.
- [x] Atomic output replacement prevents readers from observing partial files.
- [x] Generated files contain no secrets, adapters, executable hooks, Access callbacks, request state, or physical database metadata.
- [x] The public generated facade uses no `any` and keeps hovers concise.

## Tests

- [x] Snapshot and semantic tests cover deterministic output, stale hashes, nested and circular schemas, plugin methods, collisions, and malformed contributions.
- [x] A generated fixture typechecks with the supported stable TypeScript compiler before it is connected to production APIs.

## Evidence

`FrameworkApplication.compileSchemas()` now exposes the synchronous,
idempotent static phase without running plugin setup. `@ultimabase/codegen`
loads TypeScript through transpilation, creates an inert sorted snapshot, emits
compact named contracts with a Core-ABI-aware SHA-256 fingerprint, and replaces
generated files through sibling temporary files and atomic rename. Compatible
named object and enum identities are reused; normalized TypeScript identities,
plugin logical value declarations, and output destinations report their owners
when they conflict.

Focused source, type, language-service, loader, writer, and generated-semantic
tests pass, including circular relationships and `field.vector()`. The complete
repository reports 331 passing files, 1,922 passing tests, and no TypeScript
errors. Repository typecheck, constraints, formatting, build, attw, and publint
pass. The new packed codegen test and all package archive checks pass.

Repository-wide lint remains blocked by the pre-existing
`restrict-template-expressions` error in
`tests/e2e/packed-core-language-service.ts:159`. The full packed command also
reaches a pre-existing stale assertion in
`tests/e2e/core-native-schema-hooks.e2e.test.ts`: it requests the removed
`hover:create-result`/`create-one` fixture contract while the unchanged fixture
now exposes `hover:create-item`/`create`.
