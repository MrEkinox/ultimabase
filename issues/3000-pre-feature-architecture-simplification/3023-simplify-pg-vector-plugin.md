# 3023: Simplify the PostgreSQL Vector plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/pg-vector-plugin`
- Depends on: 3022
- ADR: retained custom-field decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Keep the PostgreSQL Vector plugin as the smallest complete proof of the custom
field boundary after the kernel and PostgreSQL simplifications.

## Acceptance criteria

- [x] Baseline field declaration, dimensions, snapshots, logical and storage
      codecs, PostgreSQL planning, GraphQL codec, Typegen, exports, and tests.
- [x] Remove duplicate validation, metadata, or codec adaptation now provided by
      the retained custom-field and transport projection contracts.
- [x] Preserve immutable vector values, finite-number and exact-dimension
      validation, stored-field-only scope, PostgreSQL ownership, GraphQL
      representation, JavaScript behavior, and absence when not installed.
- [x] Avoid generalizing embedded, output, similarity-search, or index behavior
      without a current requirement.
- [x] Change no public behavior, configuration, export, field shape, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected PostgreSQL Vector pages under
      `apps/website/content/docs` and, when required, update them and the package
      README in the same audited issue.

## Tests

- [x] Source and packed types, JavaScript, snapshots, invalid vectors, field
      ownership, GraphQL, PostgreSQL, and package-boundary suites pass with
      unchanged coverage evidence.

## Audit gate

- [x] Audit for lost field invariants, Postgres or GraphQL leakage, speculative
      contexts, duplicated codecs, and abstraction growth. Correct and repeat
      until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Similarity search, vector indexes, embedded vectors, or output vectors.

## Implementation and preservation audit

This package is already one focused 246-line production module. The complete
review found no safe internal reduction worth making; milestone 30 explicitly
allows a plugin issue to finish without a code reduction. No executable code,
API, test, option or extension mechanism is removed or added.

One shared `snapshotVector` already owns array shape, exact dimensions, finite
components and detached immutable values for field snapshots, GraphQL decoding
and exported plan validation. Option validation must precede metadata access
for JavaScript callers. The field builder delegates to the same factory; the
private type aliases preserve literal dimensions, options and editor help.
GraphQL encoding remains its distinct output boundary. The application-local
plan helpers and all public exports retain their current contract.

The stored-field-only builder, pure static defaults, list wrapping, exact
namespaced kind, canonical GraphQL protocol, generated method references,
plugin absence and ownership checks remain unchanged. There is still no storage
codec, PostgreSQL column compiler, similarity search, vector index, embedded
builder or output builder. No such future functionality is introduced or
claimed as delivered. The package imports only Core, plugin-kit and shared;
B-001/B-002/B-005/B-006/B-008 and P-001/P-004/P-010/P-022/P-023 are reconciled.

Metrics: one production file / 246 lines before and after; 11 public exports.
Declarations change from 4,200 to 4,193 bytes solely because a stale JSDoc now
names application-local lookup instead of a future global registry. TypeScript
transpilation with comments removed is identical; declarations with comments
removed are identical. Production line delta: zero.

Documentation impact: internal engineering documentation.
The README no longer implies an existing database compiler; it now explicitly
states the already documented physical storage limit. The owned PostgreSQL
Vector website page already explains the same limit, field validation,
GraphQL boundary and Typegen setup accurately, so it needs no public edit.

Final validation and audit:

- All 56 package, GraphQL compiler and Typegen checks pass across 12 files
  (10.65 s), including compile-time and editor contracts; the package build,
  ESLint and dependency constraints pass.
- All eight affected built checks pass across three files (3.61 s), covering
  packed editor/types, generated declarations and official manifests.
- All nine backlog checks and 66 public website checks pass after the final
  documentation update.
- The immediately preceding complete 3022 coverage report covers all 33 vector
  statements, 12 functions and 15 branches. Executable code and tests are
  identical after this documentary change, so that coverage remains applicable.
  The 3022 full built run also passed all 383 integrations, including the
  unchanged PostgreSQL boundary. No threshold, exclusion or test is changed.
- The final diff audit is green. There is no unresolved finding, new public
  boundary, speculative generalization or work beyond the acceptance criteria.
