# 1606: Harden Access and Hooks security coverage

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/core`
- Depends on: 1602, 1604
- ADR: ADR-0189, ADR-0199, ADR-0200, ADR-0205

## Goal

Give the security-critical optional products their own meaningful coverage floor
instead of allowing aggregate Core coverage to hide untested branches.

## Acceptance criteria

- [x] Access target resolution, authoring compilation, contribution ownership, item decisions, output narrowing, mutation transitions, and Master modes have focused branch coverage.
- [x] Hooks contribution ownership, diagnostics, field input traversal, ordering, revocation, rollback, and post-commit paths have focused branch coverage.
- [x] Per-package or narrower security-directory thresholds are ratcheted from the improved measured baseline and cannot be masked by unrelated Core files.
- [x] Global thresholds never decrease and production files are not excluded merely to satisfy the gate.
- [x] Every discovered behavior defect receives a regression test before its fix.
- [x] Coverage reports remain usable across unit, public E2E, PostgreSQL, and packed-package suites.

## Tests

- [x] `yarn test:coverage` passes the new Access and Hooks thresholds.
- [x] Mutation, relation, nested field, deny-as-missing, official-plus-alternative, and application-isolation matrices cover security edge cases.
- [x] Master provenance regressions from issue 1602 remain included in the security gate.

## Completion evidence

- Access now has focused tests for opaque field-kind selectors and all six
  contribution target kinds. The compiler tests verify deterministic order,
  exact instance ownership, per-contribution Master behavior, expansion
  callbacks, cross-plugin extension rejection, empty declarations, and stale
  schema or field identities. Existing public and PostgreSQL suites continue to
  cover item decisions, deny-as-missing reads, output narrowing, relation and
  mutation transitions, rollback, and audited Master provenance.
- Hooks now has focused tests for global, schema, field, and schema-extension
  contribution ownership and reversible before/after ordering. A dedicated
  Runtime regression verifies that hook values, capabilities, event emission,
  and nested-query admission are revoked after callback settlement, while the
  existing suites retain diagnostics, nested field traversal, cancellation,
  rollback, post-commit delivery, alternative engines, and application
  isolation.
- Package-specific coverage gates use the production globs
  `packages/access-plugin/src/**` and `packages/hooks-plugin/src/**`. Access
  measures 83.37% statements, 71.36% branches, 88.40% functions, and 83.12%
  lines, with floors of 83/71/88/83. Hooks measures 90.04% statements, 81.52%
  branches, 94.86% functions, and 90.11% lines, with floors of 90/81/94/90.
  Global floors remain unchanged at 88/80/90/88 and no production exclusion was
  added.
- No behavior defect was discovered while exercising the missing branches, so
  this issue changes tests and coverage policy only.

## Commands passed

- `yarn test:coverage`: 386 files, 1,994 runtime/type tests, including public
  E2E and PostgreSQL coverage projects; global measured coverage is 88.76%
  statements, 81.44% branches, 93.93% functions, and 88.90% lines.
- `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn constraints`, and
  `yarn build`, including attw and publint.
- `yarn test:pack:built`: 16 files and 77 packed-consumption tests.

## Out of scope

- Chasing 100 percent coverage without a behavioral boundary.
- Lowering thresholds or excluding difficult production files.
- Replacing conformance tests with coverage percentages.
