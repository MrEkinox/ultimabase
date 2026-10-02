# 6502: Delegate GraphQL schema composition

- Status: completed
- Milestone: 65
- Packages: graphql-plugin
- Depends on: 6501
- ADR: 0238, 0287

## Goal

Test GraphQL Tools against the existing contributed-schema composition matrix.
Keep strict conflict preflight, exact callback attribution, GraphQL 17 coercion,
root normalization, cycles, directives and detached schema topology. Remove the
manual composer only if the replacement is demonstrably smaller and equivalent.

## Working context

- Scope: GraphQL contributed-schema composition only; delegate type cloning and
  reference rewiring, retain strict preflight and owner-attributed callbacks.
- Current contracts: [GraphQL](../../packages/graphql-plugin/README.md),
  [ADR-0238](../../docs/adr/0238-graphql-v1-contract.md), existing composition
  tests and the packed GraphQL schema-execution consumer.
- Locked decisions: no Core/Runtime/public API changes; preserve first-source
  metadata, root aliases, exact errors, scalar callbacks and cyclic references.
- Rejected approaches: raw mergeSchemas permits resolver overwrites and does not
  coalesce differently named roots; mapSchema re-coerces input defaults. Use the
  narrower public rewireTypes helper only if actual-consumer parity succeeds.
- Proof commands: GraphQL unit/type tests, root typecheck, build followed by
  packed GraphQL tests, then permissioned `yarn validate:full` (local four workers;
  unchanged hosted two-worker bound).
- Exploration budget: two comparable failed variants or 30 minutes without
  verifiable progress; validation wait excluded.
- Next action: none; retained and fully validated. Continue with issue 6503.

## Experiment evidence

- Replacement: public `rewireTypes()` from `@graphql-tools/utils` 12.0.1;
  this version was already installed transitively through Yoga. Add one explicit
  runtime dependency; remove no security/ownership preflight or public export.
- Source checks: 41 files / 198 tests passed across GraphQL, HTTP, Yoga and
  explorers, with no type errors. Root `yarn typecheck` passed.
- Five added characterization cases pass against both original and candidate
  composers: identity-based roots, cycles/wrappers, enum identity, directives,
  first metadata, detached topology, interface/union callbacks, exact instance
  attribution and both internal/GraphQL-17 external scalar defaults.
- Initial candidate checks failed with mixed GraphQL realms. The existing Vitest
  namespace regex was anchored to a bare import, missing resolved absolute paths;
  correcting that existing rule made all affected checks pass. No class-check
  bypass, version downgrade or test exclusion was introduced.
- One initial test incorrectly expected no coercion of GraphQL-17 external
  defaults. Characterization of the old composer proved that GraphQL validation
  legitimately coerces these once; both forms now assert the same callback trace.
- Production TypeScript: 153 added / 252 removed, net -99 (composer and obsolete
  preflight index). Tooling rule: 1 added / 1 removed; regression tests: +311;
  one explicit dependency plus one workspace lockfile entry, no new lockfile
  package/version. The standalone GraphQL install additionally pulls the utility
  package's transitive dependencies; their existing Yoga use does not make them
  free for that consumer.

## Final audit and validation

- `yarn validate:full`: exit 0; 560 files / 2,678 ordinary tests, 639 files /
  2,942 coverage tests; no type errors. Issue checks: 22 tests. Website checks:
  66 tests. Formatting, lint, build, package export checks and constraints pass.
  Only the existing line-budget warnings remain; no failed/skipped required gate.
- `yarn vitest run --project e2e` with the GraphQL schema-execution and Yoga
  application files: 2 tests pass against the final rebuilt exports.
- Focused ESLint and package test typecheck pass. Early mixed-realm, fixture
  expectation and lint failures were corrected before this full gate.
- Coverage (729 production files, no removed coverage path or exclusions):
  statements 23,791/26,108 = 91.12%; branches 14,702/17,376 = 84.61%; functions
  5,011/5,193 = 96.49%; lines 23,070/25,161 = 91.68%. Before: 90.98%, 84.52%,
  96.09%, 91.55%, respectively. All unchanged files retain their hit coverage;
  the new tests additionally cover previously unhit resolver-attribution paths.
- Reviewed the entire diff against ADR-0238: conflict attribution, deterministic
  order, first metadata, root identity, detached fields/arguments/directives,
  generated callbacks, GraphQL-17 defaults and safe errors remain intact. No
  permissive merging, concrete Core dependency, public API or Typegen change.
- Timing is not a refactor speed claim: coverage used the existing local four
  workers versus the initial two-worker baseline. Hosted bounds remain unchanged.
- Raw validation log and coverage baseline remain in `/private/tmp`; the exact
  totals above are the durable record. No remaining audit finding; no push.

## Documentation impact

Internal engineering documentation. Update the package README and dependency
ADR/current index. Reviewed the public GraphQL website guide: configuration,
installation, outputs, safety and limitations are unchanged, so no public edit
is needed.

## Acceptance criteria

- [x] Prove actual composition/security tests and compiled package consumers.
- [x] Preserve strict rejection and all resolver/scalar ownership paths.
- [x] Measure net code/dependency changes; remove an unsuccessful experiment.
- [x] Update internal contracts, audit, full validation and dedicated local commit.
