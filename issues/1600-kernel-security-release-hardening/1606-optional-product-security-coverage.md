# 1606: Harden Access and Hooks security coverage

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/core`
- Depends on: 1602, 1604
- ADR: ADR-0189, ADR-0199, ADR-0200, ADR-0205

## Goal

Give the security-critical optional products their own meaningful coverage floor
instead of allowing aggregate Core coverage to hide untested branches.

## Acceptance criteria

- [ ] Access target resolution, authoring compilation, contribution ownership, item decisions, output narrowing, mutation transitions, and Master modes have focused branch coverage.
- [ ] Hooks contribution ownership, diagnostics, field input traversal, ordering, revocation, rollback, and post-commit paths have focused branch coverage.
- [ ] Per-package or narrower security-directory thresholds are ratcheted from the improved measured baseline and cannot be masked by unrelated Core files.
- [ ] Global thresholds never decrease and production files are not excluded merely to satisfy the gate.
- [ ] Every discovered behavior defect receives a regression test before its fix.
- [ ] Coverage reports remain usable across unit, public E2E, PostgreSQL, and packed-package suites.

## Tests

- [ ] `yarn coverage` passes the new Access and Hooks thresholds.
- [ ] Mutation, relation, nested field, deny-as-missing, official-plus-alternative, and application-isolation matrices cover security edge cases.
- [ ] Master provenance regressions from issue 1602 remain included in the security gate.

## Out of scope

- Chasing 100 percent coverage without a behavioral boundary.
- Lowering thresholds or excluding difficult production files.
- Replacing conformance tests with coverage percentages.
