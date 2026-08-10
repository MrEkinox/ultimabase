# 1101: Rename the public Typegen package and plugin API

- Status: done
- Milestone: 11
- Packages: `@ultimabase/typegen`, `@ultimabase/core`
- Depends on: none
- ADR: [ADR-0184](../../docs/adr/0184-typegen-package-identity.md)

## Goal

Replace the generic Codegen package identity with the exact Typegen identity
across the workspace and every executable consumer.

## Acceptance criteria

- [x] `packages/codegen` becomes `packages/typegen` and publishes as `@ultimabase/typegen`.
- [x] `codegenPlugin()` becomes `typegenPlugin()` with `TypegenPlugin` and `TypegenPluginOptions` contracts.
- [x] The runtime plugin identity is `@ultimabase/typegen`.
- [x] Precise generator, loader, and writer function names remain unchanged.
- [x] Package manifests, workspace dependencies, lockfile entries, executable examples, and test imports use the new identity.
- [x] Generated banners and actionable Core diagnostics name `@ultimabase/typegen`.
- [x] No compatibility package or deprecated Codegen export is introduced.

## Tests

- [x] Source public-export and plugin tests cover the renamed API and identity.
- [x] Generator, writer, loader, and automatic-startup behavior remain green.
- [x] Workspace typecheck and unit/type suites pass after the hard rename.

## Out of scope

- Generated declaration shape changes.
- GraphQL, REST, SDK, migration, or client generation.
- Manual CLI, watch, or check commands.
