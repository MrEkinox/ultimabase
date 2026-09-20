# 3023: Simplify the PostgreSQL Vector plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/pg-vector-plugin`
- Depends on: 3022
- ADR: retained custom-field decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Keep the PostgreSQL Vector plugin as the smallest complete proof of the custom
field boundary after the kernel and PostgreSQL simplifications.

## Acceptance criteria

- [ ] Baseline field declaration, dimensions, snapshots, logical and storage
      codecs, PostgreSQL planning, GraphQL codec, Typegen, exports, and tests.
- [ ] Remove duplicate validation, metadata, or codec adaptation now provided by
      the retained custom-field and transport projection contracts.
- [ ] Preserve immutable vector values, finite-number and exact-dimension
      validation, stored-field-only scope, PostgreSQL ownership, GraphQL
      representation, JavaScript behavior, and absence when not installed.
- [ ] Avoid generalizing embedded, output, similarity-search, or index behavior
      without a current requirement.
- [ ] Change no public behavior, configuration, export, field shape, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected PostgreSQL Vector pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [ ] Source and packed types, JavaScript, snapshots, invalid vectors, field
      ownership, GraphQL, PostgreSQL, and package-boundary suites pass with
      unchanged coverage evidence.

## Audit gate

- [ ] Audit for lost field invariants, Postgres or GraphQL leakage, speculative
      contexts, duplicated codecs, and abstraction growth. Correct and repeat
      until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Similarity search, vector indexes, embedded vectors, or output vectors.
