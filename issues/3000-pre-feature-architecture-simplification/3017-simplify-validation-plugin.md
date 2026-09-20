# 3017: Simplify the Validation plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/validation-plugin`
- Depends on: 3016
- ADR: retained validation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Reduce the optional Validation plugin to the smallest Standard Schema
integration that preserves the final mutation-input guard.

## Acceptance criteria

- [ ] Baseline declaration, compilation, Typegen, guard registration, error,
      export, and test paths against the contract matrix.
- [ ] Remove duplicate field traversal, snapshots, normalization, or guard
      plumbing now owned by retained Core projections.
- [ ] Preserve synchronous rejection-only validation of complete final values,
      embedded-property support, error paths, no replay on reads or results,
      JavaScript behavior, and absence when the plugin is not installed.
- [ ] Keep structural validation in Core and application validation in this
      plugin with no ownership leak.
- [ ] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [ ] Review the affected Validation pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Source and packed types, JavaScript, Standard Schema implementations,
      transforms, nested values, deltas, rollback, errors, and PostgreSQL suites
      pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for duplicate validation, changed timing, replayed defaults,
      structural/application coupling, lost errors, and unnecessary machinery.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New validator kinds, asynchronous validation, or moving validation into Core.
