# 3404: Remove legacy authoring paths

- Status: completed
- Milestone: 34
- Depends on: 3403
- ADR: ADR-0270

## Goal

Remove `definePlugin()`, `definePluginModule()`, public phase buckets, and their
types after migrating repository fixtures and consumers.

## Acceptance criteria

- [x] The Core root exposes one plugin construction factory: `plugin()`.
- [x] Tests, examples, templates, and fixtures use the canonical form.
- [x] Superseded implementation, exports, and documentation are deleted rather
      than retained as aliases.
- [x] Deep imports and structural forgeries remain rejected.

## Handoff

- Documentation impact: both. Core and Plugin Kit READMEs, package examples,
  schema/runtime engineering guides, the public plugin-authoring website, the
  minimal example, and the create-app template now show only `plugin()` with an
  ordered `contributions` list.
- Removed the public `definePlugin()`, `definePluginModule()`, phase-bucket,
  setup, and lifecycle authoring types. Core retains one private compiler for
  the same application graph; no compatibility alias or second authoring path
  remains.
- Migrated every repository test, TypeScript/JavaScript fixture, E2E harness,
  example, and template. An exhaustive repository search outside historical
  ADRs and issues finds no current `definePlugin`, `definePluginModule`, or
  `DefinePluginOptions` usage.
- Privileges used by callback facades are now attached to the exact owning
  contribution with `withPluginPrivileges()`. Missing and unused reasons fail
  during `plugin()` construction before declaration or lifecycle effects.
- Validation passed: typecheck; 540 files and 2,557 unit/type/performance tests;
  98 files and 387 E2E/PostgreSQL tests; 32 files and 163 package-archive tests;
  615 files and 2,804 coverage tests; website docs (17 files, 66 tests); lint
  with no errors; build with clean `attw`/`publint`; and Prettier for every
  changed file. Repository-wide `format:check` still reports two unchanged
  pre-existing files outside this issue.
