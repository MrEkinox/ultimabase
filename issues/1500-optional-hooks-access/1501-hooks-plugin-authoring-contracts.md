# 1501: Extract the complete Hooks plugin

- Status: completed
- Milestone: 15
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1414
- ADR: ADR-0189, ADR-0194, ADR-0202, ADR-0203

## Goal

Create the complete official Hooks plugin and move its authoring contracts and
Runtime lifecycle out of Core as one atomic extraction.

## Acceptance criteria

- [x] Create one `@ultimabase/hooks-plugin`; importing it installs no behavior and configuring its exported definition enables the official lifecycle.
- [x] The plugin owns schema and field `hooks` option namespaces, callback contracts, target selectors, phase families, and exact Typegen declarations.
- [x] Installing the plugin restores the accepted compact Hooks DX through public static declarations.
- [x] Omitting the plugin leaves hook options absent from generated autocomplete and fails declared hook metadata as an unknown option; installing the plugin recognizes and types the option without a Core-owned Hooks registry.
- [x] Plugins compatible with the official lifecycle import its public contracts from hooks-plugin; independent alternatives use only the generic public kernel.
- [x] Hooks plugin compiles declarations and contributions into public Runtime capabilities with no private Core import, assembly branch, or hidden dispatcher.
- [x] Resolve-input, validation, prepared-target, before, after, output, before-commit, after-commit, rollback, error, and event semantics retain their accepted order.
- [x] Hook-started writes retain automatic transactions, rollback-only behavior, request lifetime, cancellation, recursion diagnostics, and logical-operation identity across persistence rewrites.
- [x] Plugin, schema, and affected-field hooks retain dependency-first deterministic composition.
- [x] No-Hooks applications allocate no dispatcher, placeholder callback, hook snapshot, or per-request hook state.
- [x] Core retains only generic middleware, transaction, cancellation, event, and context primitives needed by other engines.

## Tests

- [x] Existing focused Hook suites migrate to the package and pass through public kernel contracts.
- [x] Runtime declaration, type, language-service, source, packed, PostgreSQL, and application-isolation tests preserve exact inference, ownership, ordering, transaction, output, itemized-batch, and persistence-rewrite behavior.
- [x] Negative tests prove Core alone exposes no Hooks authoring vocabulary after the migration boundary is active.

## Completion evidence

- `yarn typecheck`, `yarn test`, `yarn lint`, `yarn constraints`, and `yarn build` pass.
- Built E2E and packed-archive suites pass through public package exports.
- The complete PostgreSQL Testcontainers project passes with 21 files and 73 tests.

## Out of scope

- Designing new Hook phases or changing accepted callback semantics.
- Access or policy behavior.
