# 5701: Restore Runtime boundary snapshots

- Status: completed
- Milestone: 57
- Packages: `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 5601
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Repair the two regressions exposed by the complete coverage gate without
changing public APIs, Runtime order, or supported capabilities.

## Acceptance criteria

- [x] Hooks returns the validated result and mutation-outcome snapshots instead
      of discarding them for metadata-losing generic copies.
- [x] Access applies Core's complete mutation-outcome decoder only to native
      upserts, whose materializations it actually consumes.
- [x] The existing nested-write and virtual-field public vertical tests pass
      unchanged.
- [x] `yarn test:coverage` passes in full and remains a mandatory pre-commit
      gate for debt-reduction and behavior-preserving refactors.
- [x] Standard repository validation passes.
- [x] Documentation impact is recorded.

## Out of scope

- Changing public behavior, Runtime order, or plugin capabilities.
- Weakening the existing public vertical assertions.
- Redesigning Runtime behavior generics.

## Documentation impact

Internal engineering documentation. The public contract is unchanged; only the
agent validation contract and issue handoff need correction.

## Outcome

The unchanged source-mode public verticals proved two code regressions. Hooks
was validating native mutation outcomes and hydrated results but discarding the
returned snapshots, which removed private selection metadata. Access was also
decoding complete outcomes before establishing that the operation was an
upsert, rejecting private persisted fields used by virtual projections.

Hooks now returns both validated snapshots, and Access returns before outcome
decoding for non-upserts. No public API, operation order, authority rule,
transaction boundary, plugin capability, or test expectation changed.

Production TypeScript adds 12 lines and removes 6, a net increase of 6. The
repository contract adds 5 lines making the complete coverage gate mandatory.

## Validation

- focused source-mode PostgreSQL verticals: 2 files, 4 tests
- `yarn typecheck`
- `yarn test`: 545 files, 2,582 tests, no type errors
- `yarn lint`: 0 errors; 49 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 620 files, 2,829 tests, no type errors
- coverage: 90.91% statements, 84.43% branches, 96.07% functions, 91.47% lines
