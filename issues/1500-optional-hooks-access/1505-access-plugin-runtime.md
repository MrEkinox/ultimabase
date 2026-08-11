# 1505: Move Access execution into access-plugin

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1504
- ADR: ADR-0117, ADR-0128, ADR-0167 through ADR-0171, ADR-0189, ADR-0194

## Goal

Execute official Access plans entirely through public protected enforcement and
adapter capabilities while preserving every accepted security invariant.

## Acceptance criteria

- [ ] Access plugin evaluates operation, filter, item, and field decisions through public Runtime capabilities with no private Core assembly branch.
- [ ] Denials remain irreversible, row predicates and opaque constraints accumulate with logical `AND`, and field restrictions intersect before final output.
- [ ] Initial evaluation, target preparation, value-dependent reevaluation, relationship recursion, and final restriction retain current order and fail-closed behavior.
- [ ] Rewritten persistence plans carry the logical target's protected restrictions into the actual adapter statement.
- [ ] Master remains a Core authority observed through the existing audited request context; the plugin explicitly declares bypass or enforcement behavior without creating Master.
- [ ] No-Access applications allocate no plan, provider snapshot, placeholder handler, or Access-specific request state.

## Tests

- [ ] Existing Access and enforcement suites migrate or adapt through public plugin APIs and retain focused coverage.
- [ ] PostgreSQL E2E covers reads, counts, relations, itemized mutations, field transitions, master, persistence rewrites, and application isolation.

## Out of scope

- New Access policy semantics or provider types.
- Final Core removal audit; issue 1508 owns it.
