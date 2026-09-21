# 3105: Decide the internal schema compilation boundary

- Status: planned
- Milestone: 31
- Packages: architecture documentation; @ultimabase/core and compiled-graph consumers
- Depends on: 3104
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Decide whether to remove the IR round trip left after compiler substitution disappeared, while preserving every live compilation invariant.

## Acceptance criteria

- [ ] Map encodeSchemaCompilerInput -> canonical compiler -> assertSchemaCompilerOutput -> decodeSchemaCompilerOutput, artifact-session ownership and all downstream schema/selection/command facts.
- [ ] Separate obsolete public-compiler transport machinery from necessary immutable snapshots, exact provenance, deterministic selectors, additive patches, option ownership, system fields, relations and atomic graph publication.
- [ ] Propose the smallest typed internal design with a before/after ownership and data-flow description. Keep one canonical command graph and least-authority Typegen/transport inspection; no public executable compiler data.
- [ ] Name every changed internal/observable contract, retained validation and consumer migration. Do not describe all 21 files/3,648 lines as removable or promise performance gains.
- [ ] Present the proposal to the user and stop before accepting an ADR or starting 3106. Record explicit approval of the final scope; if a prior user message already approved that exact proposal, reference it rather than asking again.
- [ ] The accepted ADR supersedes only the affected internal IR requirements of ADR-0196 and its retained refinements, including ADR-0259. Do not rewrite accepted history or revive compiler substitution.
- [ ] If equivalent preservation is not demonstrated or the user retains the existing design, record that decision and supersede 3106 explicitly; do not force a refactor for a metric.

## Tests

- [ ] Audit the proposed flow against every real compiler/command/Typegen/transport consumer and existing security/conformance scenarios.
- [ ] Validate ADR/issue links, dependency direction, metadata, formatting and git diff --check.

## Audit and commit gate

- [ ] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [ ] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [ ] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [ ] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Production code changes, accepting an unapproved ADR, removing structural validation or creating another public compiler mechanism.

## Handoff

Not started. The preparation request does not authorize implementation.
