# 6502: Delegate GraphQL schema composition

- Status: in-progress
- Milestone: 65
- Packages: graphql-plugin
- Depends on: 6501
- ADR: 0238

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
- Next action: replace only the manual reference wiring and prove the existing
  matrix plus root aliases/cycles/enum/directive/default/attribution regressions.

## Acceptance criteria

- [ ] Prove actual composition/security tests and compiled package consumers.
- [ ] Preserve strict rejection and all resolver/scalar ownership paths.
- [ ] Measure net code/dependency changes; remove an unsuccessful experiment.
- [ ] Update internal contracts, audit, full validation and dedicated local commit.
