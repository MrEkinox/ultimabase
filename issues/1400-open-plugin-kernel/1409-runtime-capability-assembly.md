# 1409: Assemble Runtime through public capability middleware

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1408
- ADR: ADR-0186, ADR-0188, ADR-0190, ADR-0191, ADR-0193

## Goal

Replace closed Runtime contribution categories with privilege-aware public
capability middleware while preserving mandatory validation, transaction,
constraint, cancellation, and master boundaries.

## Acceptance criteria

- [ ] Runtime assembly consumes versioned single, multiple, and pipeline capabilities instead of hard-coded generic contribution buckets.
- [ ] Plugins can intercept logical operations, append protected constraints, observe results, participate before commit, and deliver after commit through exact public contracts.
- [ ] Ordinary middleware cannot inspect, clear, reorder, or broaden protected guards, row filters, constraints, or field restrictions.
- [ ] `runtime:observe`, `runtime:intercept`, `runtime:constrain`, and `runtime:replace` expose distinct facades and diagnostics; observers cannot alter execution.
- [ ] Runtime replacement retains request cancellation, application ownership, transaction lifetime, master non-forgeability, and declared adapter requirements.
- [ ] An application with no contribution composes no placeholder handler or per-request registry.
- [ ] Runtime receives only materialized required or optional application capabilities; no generic setup registry, undeclared service lookup, or denied facade survives into request execution.

## Tests

- [ ] Runtime tests cover middleware order, transforms, protected state, cancellation, recursion, replacement, cleanup, malformed returns, and application isolation.
- [ ] Type and packed tests prove exact operation/result correlation and public-only plugin imports.

## Out of scope

- Persistence-plan replacement; issue 1410 owns that boundary.
- Extracting Hooks or Access before milestone 15.
