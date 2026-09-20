# 3016: Simplify the Hooks plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/hooks-plugin`
- Depends on: 3015
- ADR: retained Hooks and public-kernel decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify official Hooks declaration and dispatch while preserving lifecycle,
ordering, attribution, transaction, and event behavior.

## Acceptance criteria

- [ ] Baseline the package's declarations, normalized forms, phase dispatch,
      event paths, diagnostics, exports, and tests against the contract matrix.
- [ ] Remove duplicated command lookup, normalization, registration, projection,
      and phase-routing work replaced by the canonical graph.
- [ ] Preserve dependency and registration ordering, field and schema input
      resolution, logical operation identity, nested-write context, before and
      after transaction behavior, beforeCommit, afterCommit, events, callback
      attribution, compatible providers, and diagnostics.
- [ ] Keep Hooks independent from Access and product-specific operations.
- [ ] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [ ] Review the affected Hooks pages under `apps/website/content/docs` and,
      when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Source and packed types, JavaScript, conformance, ordering, schema
      mutations, nested writes, rollback, events, diagnostics, Master, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit the full diff for reordered callbacks, transaction escape,
      duplicated dispatch, lost attribution, product vocabulary, and needless
      abstractions. Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding Hook phases, asynchronous jobs, or a product-specific lifecycle.
