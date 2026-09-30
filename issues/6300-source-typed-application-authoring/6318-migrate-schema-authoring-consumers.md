# 6318: Migrate schema authoring consumers

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`, repository consumers
- Depends on: 6317
- ADR: ADR-0279, ADR-0280, ADR-0281
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Move ordinary schema declarations to `App.Schema.define()` (or
`UltimaBase.Schema.define()` for portable zero-plugin schemas), then remove the
standalone ordinary `Schema.define()` entry point without changing the sole
schema compiler. Keep `Schema.is()` and `Schema.defineSpecialized()` for their
current package-owned use cases.

## Acceptance criteria

- [ ] Inventory standalone authoring across production, tests, fixtures,
      examples, website, generated starter templates, and source/packed editor
      probes; distinguish executable calls from prose and embedded source strings.
- [ ] Migrate each consumer according to its exact installed plugin source
      contract, preserving direct options, custom fields, circular relations,
      indexes, specialized schemas, JavaScript behavior, and explicit registration.
- [ ] Rewrite negative Runtime fixtures so they still exercise Runtime
      validation without weakening positive TypeScript diagnostics.
- [ ] Remove only standalone ordinary `Schema.define()`; `App.Schema.define()`
      delegates to the same Core compiler and remains inert until registration.
- [ ] Remove old-form type and barrel exports without adding a new global
      registry, source scope, generated client, or parallel schema compiler.
- [ ] Review and update Core schema examples, package READMEs, public website
      pages, and starter templates; record exactly one Documentation impact
      classification.

## Tests

- [ ] Source and packed editor tests prove configured presence/absence,
      completion, hover, diagnostics, and retained named Typegen graph contracts.
- [ ] Runtime tests preserve schema identity, immutable models, compiler
      validation, specialization, plugin options, and JavaScript execution.
- [ ] Locked TypeScript budgets, complete coverage, and `yarn validate:full`
      pass before completion.

## Audit and commit gate

- [ ] Record a fresh baseline after 6317 and migrate bounded package groups;
      avoid a repository-wide blind rename.
- [ ] Audit all old-form calls, imports, comments, fixtures, test assertions,
      generated output, and public docs; correct findings and rerun invalidated
      checks until none remain.
- [ ] Complete every checkbox and required validation before marking completed.
- [ ] Create one dedicated local commit, inspect its committed diff, and do not
      push without the user's explicit request.

## Out of scope

- Removing `Schema.is()` or `Schema.defineSpecialized()`.
- Application-handle and ordinary explicit-selector removal (6314).
- Typegen projection pruning (6313).
