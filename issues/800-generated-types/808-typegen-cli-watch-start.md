# 808: Add manual schema generation commands and watch mode

- Status: deferred
- Milestone: future
- Packages: future CLI package, `@ultimabase/typegen`
- Depends on: 806, 207
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Provide manual commands for deterministic full schema generation, continuous
regeneration, and CI verification without starting the application.

## Deferral

Product review on 2026-08-09 deferred every CLI command. The generated-schema
milestone continues through the public `@ultimabase/typegen` API and committed
deterministic artifacts. This issue retains the accepted future command
requirements without blocking the repository FieldBuilder migration.

Automatic writable-development generation is not deferred: a configured
`typegenPlugin()` regenerates during `UltimaBase.start()`. The future CLI reuses
the same generator when developers explicitly request generation without a
runtime start.

## Acceptance criteria

- [ ] `ultimabase generate` performs one complete generation and exits with stable diagnostics.
- [ ] `ultimabase generate --check` compares deterministic output without modifying the working tree.
- [ ] `ultimabase generate --watch` performs an initial full generation, watches every discovered schema, configuration, and contributing plugin source, then debounces complete regenerations.
- [ ] Build integration generates before typecheck and compilation so a clean checkout needs no manual bootstrap step.
- [ ] Read-only packaged startup regenerates or verifies the same graph without requiring writes into installed source or package directories.
- [ ] Watch output does not watch its own generated files, loop indefinitely, retain stale dependencies, or hide a failed generation behind the last successful result.
- [ ] Signals and shutdown cleanly stop watchers and any child application process.
- [ ] The initial implementation deliberately performs complete regeneration; no incremental cache is introduced without measured need.

## Tests

- [ ] CLI integration tests cover success, syntax failure, missing plugin, stale check, atomic replacement, watch add/change/remove events, startup ordering, and read-only output handling.
- [ ] Packed executable tests use only published package exports.
