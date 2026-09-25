# 3301: Introduce the Core plugin factory and compact public type

- Status: completed
- Milestone: 33
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: none
- ADR: ADR-0269

## Goal

Make configured plugin factories a direct Core concept and replace positional
public plugin typing with a compact property-based contract.

## Acceptance criteria

- [x] Core exposes the canonical factory used to bind package identity once and create configured instances.
- [x] The factory supports every existing definition option without delegating ownership or validation to Plugin Kit.
- [x] Public plugin instance and setup-export inference no longer require a long positional generic tuple.
- [x] Multiple explicit instances, immutable package facts, lifecycle hooks, dependencies, peers, conflicts, privileges, claims, capabilities, declarations, and setup exports retain exact behavior.
- [x] Runtime and language-service tests protect direct Core authoring.

## Tests

- [x] Focused Core runtime and type tests pass.
- [x] Plugin Kit tests pass while its temporary bridge delegates to Core.

## Handoff

- Documentation impact: both. ADR-0269 and the milestone plan record the
  architectural boundary; the Core and Plugin Kit READMEs plus the website
  authoring and package-reference pages now teach Core-first authoring.
- Validation: `yarn typecheck`; `yarn workspace @ultimabase/core test` (259
  files, 1,318 tests); `yarn workspace @ultimabase/plugin-kit test` (6 files,
  23 tests); Core and Plugin Kit builds including package checks; and
  `yarn website:validate` (17 files, 66 tests).
- The pre-existing public type assertion that exposed private `setup` was
  corrected during the compact-type audit; setup remains callable only by the
  Core lifecycle and its result remains application-owned.

## Out of scope

- Capability-list flattening and operation contribution consolidation, which are handled by later milestone issues.
