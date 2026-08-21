# 1505: Move Access execution into access-plugin

- Status: merged
- Merged into: 1504
- Milestone: 15
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1504
- ADR: ADR-0117, ADR-0128, ADR-0167 through ADR-0171, ADR-0189, ADR-0194, ADR-0204

ADR-0204 requires Access authoring, plan compilation, and Runtime enforcement
to cross the package boundary atomically. This issue's acceptance criteria move
into issue 1504; it is not a separate implementation or commit.

## Goal

Execute official Access plans entirely through public protected enforcement and
adapter capabilities while preserving every accepted security invariant.

## Acceptance criteria

- [x] Access plugin evaluates operation, filter, item, and field decisions through public Runtime capabilities with no private Core assembly branch.
- [x] Denials remain irreversible, row predicates and opaque constraints accumulate with logical `AND`, and field restrictions intersect before final output.
- [x] Initial evaluation, target preparation, value-dependent reevaluation, relationship recursion, and final restriction retain current order and fail-closed behavior.
- [x] Rewritten persistence plans carry the logical target's protected restrictions into the actual adapter statement.
- [x] Master remains a Core authority observed through the existing audited request context; the plugin explicitly declares bypass or enforcement behavior without creating Master.
- [x] No-Access applications allocate no plan, provider snapshot, placeholder handler, or Access-specific request state.

## Tests

- [x] Existing Access and enforcement suites migrate or adapt through public plugin APIs and retain focused coverage.
- [x] PostgreSQL E2E covers reads, counts, relations, itemized mutations, field transitions, master, persistence rewrites, and application isolation.

## Out of scope

- New Access policy semantics or provider types.
- Final Core removal audit; issue 1508 owns it.
