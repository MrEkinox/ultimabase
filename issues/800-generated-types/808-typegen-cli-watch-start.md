# 808: Add schema generation commands and watch mode

- Status: planned
- Milestone: 8
- Packages: future CLI package, future codegen package
- Depends on: 806, 207
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Provide the developer command cycle for deterministic full schema generation,
continuous regeneration, CI verification, and generation before application
startup.

## Acceptance criteria

- [ ] `ultimabase generate` performs one complete generation and exits with stable diagnostics.
- [ ] `ultimabase generate --check` compares deterministic output without modifying the working tree.
- [ ] `ultimabase generate --watch` performs an initial full generation, watches every discovered schema, configuration, and contributing plugin source, then debounces complete regenerations.
- [ ] Development startup and source-mode `ultimabase start` complete generation before loading the runtime application.
- [ ] Build integration generates before typecheck and compilation so a clean checkout needs no manual bootstrap step.
- [ ] Read-only packaged startup regenerates or verifies the same graph without requiring writes into installed source or package directories.
- [ ] Watch output does not watch its own generated files, loop indefinitely, retain stale dependencies, or hide a failed generation behind the last successful result.
- [ ] Signals and shutdown cleanly stop watchers and any child application process.
- [ ] The initial implementation deliberately performs complete regeneration; no incremental cache is introduced without measured need.

## Tests

- [ ] CLI integration tests cover success, syntax failure, missing plugin, stale check, atomic replacement, watch add/change/remove events, startup ordering, and read-only output handling.
- [ ] Packed executable tests use only published package exports.
