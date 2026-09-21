# 3017: Simplify the Validation plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/validation-plugin`
- Depends on: 3016
- ADR: retained validation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Reduce the optional Validation plugin to the smallest Standard Schema
integration that preserves the final mutation-input guard.

## Acceptance criteria

- [x] Baseline declaration, compilation, Typegen, guard registration, error,
      export, and test paths against the contract matrix.
- [x] Remove duplicate field traversal, snapshots, normalization, or guard
      plumbing now owned by retained Core projections.
- [x] Preserve synchronous rejection-only validation of complete final values,
      embedded-property support, error paths, no replay on reads or results,
      JavaScript behavior, and absence when the plugin is not installed.
- [x] Keep structural validation in Core and application validation in this
      plugin with no ownership leak.
- [x] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [x] Review the affected Validation pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Source and packed types, JavaScript, Standard Schema implementations,
      transforms, nested values, deltas, rollback, errors, and PostgreSQL suites
      pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for duplicate validation, changed timing, replayed defaults,
      structural/application coupling, lost errors, and unnecessary machinery.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- New validator kinds, asynchronous validation, or moving validation into Core.

## Implementation and preservation audit

Arithmetic projection now accepts the schema already resolved and checked by
its caller, rather than rereading the same operation for every target. Bulk
validation prepares its common immutable update expression once before walking
the target list. Singular update/upsert cases share their identical dispatch.
Target/result snapshots, numeric projection, validator invocation order, atomic
deltas and existing error paths remain unchanged.

The other mechanisms remain necessary: Core's children-first field traversal
already supplies direct occurrences; the application-local structural-plan
cache avoids repeated compilation; setup checks and Runtime protocol checks
cover different boundaries for opaque validators; and the success-value
comparison prevents transformations. Removing these would weaken an existing
contract or require a new Core API, neither of which this issue introduces.

| Metric                              | Before (`bc8aeb06`) |     After |
| ----------------------------------- | ------------------: | --------: |
| Production source files / lines     |             7 / 787 |   6 / 757 |
| Public exports / declaration bytes  |           9 / 4,390 | 9 / 4,390 |
| Direct options / behavior callbacks |               1 / 2 |     1 / 2 |
| Package unit/type tests             |                  41 |        41 |

An unused 23-line fixture module is removed: repository-wide searches found no
consumer of either local export, and neither appears in the built package. The
milestone's unchanged counting rules included that colocated fixture in the
production total; the executable simplification itself removes seven lines.
Built declarations are byte-identical. No new public
API, provider protocol, validator kind, ownership boundary or abstraction is
introduced. B-001–B-007/B-010–B-012 and P-002/P-012/P-019 retain structural
integrity, final-input ordering, JS/types, transport parity and plugin optionality.
No contract-matrix decision changes.

Documentation impact: internal engineering documentation.
The README now explicitly describes sequential application replacement and
isolated workers under the already accepted ADR-0258. The owned website
Validation page remains accurate: its direct option, ordering, supported values,
rejection-only semantics, errors and read behavior are unchanged. No website
edit or new public behavior is needed.

Validation and final audit:

- All 2,778 source coverage tests pass (608 files, 447.11 s). Comparing all
  704 maps to 3016 finds no lost coverage on retained locations; eight edited
  records were reviewed against the preserved caller check, projection and
  merged switch arm. The shared expression and each projected target execute.
- That global run preceded removal of the unimported fixture. Its four
  statements, two functions and eleven branch locations were all unexecuted;
  its removal changes no retained coverage and no threshold or exclusion.
  The original coverage report remains intact, including that removed file.
- After the fixture deletion, the 41 package unit/type tests, root typecheck,
  package build and ESLint pass. Built declarations remain byte-identical.
- Both built integration suites pass (JavaScript with Zod/Valibot and
  PostgreSQL single-pass validation). Constraints also pass; no dependency,
  Core or transport change is introduced.
- The final diff audit finds no remaining defect, behavior change, extra
  abstraction or work outside the issue criteria. No test scenario is removed.
