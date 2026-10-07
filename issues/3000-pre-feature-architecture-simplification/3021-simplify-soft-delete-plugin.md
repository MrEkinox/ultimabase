# 3021: Simplify the Soft Delete plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/soft-delete-plugin`
- Depends on: 3020
- ADR: retained Soft Delete and schema-mutation decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Soft Delete on the canonical schema-mutation and persistence-plan
contracts without changing visibility, authorization, or lifecycle semantics.

## Acceptance criteria

- [x] Baseline mode compilation, tombstone declaration, protected constraints,
      explicit mutation, delete-plan rewrite, private restore and purge, codecs,
      exports, and tests.
- [x] Remove duplicate command metadata, schema traversal, visibility planning,
      binding, Typegen, and transport projection work replaced by the canonical
      graph.
- [x] Preserve disabled, replace-delete, and explicit modes; protected active-row
      visibility; logical delete identity; Hooks and Access command keys;
      transaction behavior; non-disclosing targets; and private audited Master
      restore and purge.
- [x] Keep the plugin independent from Access, Hooks, transports, PostgreSQL,
      and Core product vocabulary.
- [x] Change no public behavior, configuration, export, route, field, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected Soft Delete pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Direct TypeScript, JavaScript, packed types, Access, Hooks, relations,
      rollback, cancellation, REST, GraphQL, Yoga, Master, and PostgreSQL suites
      pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for visibility leaks, product coupling, changed logical identity,
      duplicate planners, authority escape, and unnecessary abstractions.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding deletion timestamps, deleted reads, or user-authorized restoration.

## Implementation and preservation audit

Visibility now retains a private set of exact compiled schema identities instead
of an immutable array of one-property plan objects and a linear wrapper lookup.
The same exact plugin-instance tombstone provenance selects the set. It never
escapes the closure and is not mutated. Row filters, Master enforcement, create
exceptions and exact owner/version/command checks for administration are unchanged.

The three mutation definitions share their existing undefined-only input
contract and Typegen reference. Their authority, logical identity, handler,
returning phase, owner-only effects and transport bindings remain separate.
The manifest's exact literal types are inferred from its unchanged readonly
values instead of manually repeating every privilege and reason. No privilege,
provider, selector, order, static fingerprint, schema or model surface changes.

| Metric                             | Before (`72abe7a0`) |     After |
| ---------------------------------- | ------------------: | --------: |
| Production source files / lines    |             8 / 788 |   8 / 738 |
| Public exports / declaration bytes |           5 / 3,473 | 5 / 3,403 |
| Privileges / capability providers  |               7 / 7 |     7 / 7 |

The declaration diff is exactly seven redundant `Readonly<...>` wrappers around
objects whose properties are already readonly. The tuple, literal names/reasons,
exports and remaining declaration text are identical. Public types are equivalent;
there is no API migration. The two actual modes, disabled/default selection,
private audited restore/purge, logical delete identity, protected visibility and
Core-owned persistence envelopes retain their contracts. B-001–B-012 and
P-002/P-003/P-005/P-007/P-009–P-013/P-015/P-017/P-019/P-022/P-023 are reconciled.
The static selector blocks retain their distinct contribution IDs and ordering;
merging them would trade clear provenance for little benefit. Core, Access,
Hooks and transports receive no product vocabulary or dependency.

Documentation impact: internal engineering documentation.
The package README and owned Soft Delete website page were reviewed. Modes,
TypeScript/REST/GraphQL calls, visibility, Master administration and V1 limits
remain accurate; no public documentation edit is needed. The suspended feature
stash is untouched: no timestamps, deleted reads or user-authorized restore
are introduced.

Final validation and audit:

- All 19 package unit/type tests pass, as do root typecheck, final package build,
  ESLint and dependency constraints. The build's isolated-declaration requirement
  is satisfied with the existing typed operation-value contract; the decoder
  retains its explicit undefined return under the repository lint rule.
- All 274 package/boundary/source-integration tests pass across 81 files
  (130.31 s). Coverage spans all eight source maps with repository exclusions
  and thresholds unchanged. Comparison against the full 3018 baseline finds no
  lost retained covered location. All 31 edited/deleted records were audited:
  the common input callback receives the previous 13 + 29 = 42 calls, and the
  visibility evaluator retains its 430 calls and both target-membership outcomes.
- All 23 affected built integrations pass across seven files (8.52 s), including
  JavaScript without Typegen, relations/visibility, Master administration,
  explicit and replacement deletes, rollback, public transports and protection.
- The final complete diff audit is green. No test is removed or weakened, no
  paused feature is resumed and no work exceeds the acceptance criteria.
