# 1409: Assemble Runtime through public capability middleware

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1408
- ADR: ADR-0186, ADR-0188, ADR-0190, ADR-0191, ADR-0193, ADR-0199

## Goal

Replace closed Runtime contribution categories with privilege-aware public
capability middleware while preserving mandatory validation, transaction,
constraint, cancellation, and master boundaries.

## Acceptance criteria

- [x] Runtime assembly consumes versioned single, multiple, and pipeline capabilities instead of hard-coded generic contribution buckets.
- [x] Plugins can intercept logical operations, append protected constraints, observe results, participate before commit, and deliver after commit through exact public contracts.
- [x] Ordinary middleware cannot inspect, clear, reorder, or broaden protected guards, row filters, constraints, or field restrictions.
- [x] `runtime:observe`, `runtime:intercept`, `runtime:constrain`, and `runtime:replace` expose distinct facades and diagnostics; observers cannot alter execution.
- [x] Runtime replacement retains request cancellation, application ownership, transaction lifetime, master non-forgeability, and declared adapter requirements.
- [x] An application with no contribution composes no placeholder handler or per-request registry.
- [x] Runtime receives only materialized required or optional application capabilities; no generic setup registry, undeclared service lookup, or denied facade survives into request execution.

## Tests

- [x] Runtime tests cover middleware order, transforms, protected state, cancellation, recursion, replacement, cleanup, malformed returns, and application isolation.
- [x] Type and packed tests prove exact operation/result correlation and public-only plugin imports.

## Out of scope

- Persistence-plan replacement; issue 1410 owns that boundary.
- Extracting Hooks or Access before milestone 15.

## Implementation notes

- Core provides one canonical application-lifetime executor and keeps request,
  master, cancellation, adapter, transaction, and protected-enforcement
  ownership outside the replacement boundary.
- Exact public factories materialize interceptor, constraint, and observer
  definitions with owner provenance and application cleanup. Generic providers,
  requirements, replacements, decorators, and malformed executor factories fail
  before execution.
- The ACL policy plugin now contributes its Runtime enforcement and input
  transformation entirely through the public capability API.
- The legacy Runtime, event, and pipeline setup hosts and every fixture using
  them were removed without compatibility aliases.

## Validation

- `yarn typecheck`
- `yarn lint` (zero errors; line-budget warnings only)
- `yarn test` (320 files, 1,951 tests)
- `yarn build` (all packages pass Are The Types Wrong and publint)
- `yarn test:pack:built` (9 files, 52 tests)
- `yarn test:e2e:built` (30 files, 130 tests, including PostgreSQL)
