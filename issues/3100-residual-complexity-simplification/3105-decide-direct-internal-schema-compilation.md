# 3105: Decide the internal schema compilation boundary

- Status: completed
- Milestone: 31
- Packages: architecture documentation; @ultimabase/core and compiled-graph consumers
- Depends on: 3104
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Decide whether to remove the IR round trip left after compiler substitution disappeared, while preserving every live compilation invariant.

## Acceptance criteria

- [x] Map encodeSchemaCompilerInput -> canonical compiler -> assertSchemaCompilerOutput -> decodeSchemaCompilerOutput, artifact-session ownership and all downstream schema/selection/command facts.
- [x] Separate obsolete public-compiler transport machinery from necessary immutable snapshots, exact provenance, deterministic selectors, additive patches, option ownership, system fields, relations and atomic graph publication.
- [x] Propose the smallest typed internal design with a before/after ownership and data-flow description. Keep one canonical command graph and least-authority Typegen/transport inspection; no public executable compiler data.
- [x] Name every changed internal/observable contract, retained validation and consumer migration. Do not describe all 21 files/3,648 lines as removable or promise performance gains.
- [x] Present the proposal to the user and stop before accepting an ADR or starting 3106. Record explicit approval of the final scope; if a prior user message already approved that exact proposal, reference it rather than asking again.
- [x] The accepted ADR supersedes only the affected internal IR requirements of ADR-0196 and its retained refinements, including ADR-0259. Do not rewrite accepted history or revive compiler substitution.
- [x] If equivalent preservation is not demonstrated or the user retains the existing design, record that decision and supersede 3106 explicitly; do not force a refactor for a metric.

## Tests

- [x] Audit the proposed flow against every real compiler/command/Typegen/transport consumer and existing security/conformance scenarios.
- [x] Validate ADR/issue links, dependency direction, metadata, formatting and git diff --check.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Production code changes, accepting an unapproved ADR, removing structural validation or creating another public compiler mechanism.

## Handoff

Started after the audited `ddeea4de` commit. Production source remains unchanged.
The exact design and invariant/consumer migration are in
[accepted ADR-0263](../../docs/adr/0263-direct-private-schema-compilation.md).
The user explicitly accepted this exact proposal on 2026-09-21 with "validé",
including the accidental marker selector delta and a separate bounded Core
resolver cleanup. The 3106 dependency is resolved after this decision commit.

The reviewed flow keeps direct private prepared objects, selection snapshots,
normalized options, exact owners, final validation and atomic publication. It
authorizes only the obsolete transport removal with all retained checks.
A built-public-package experiment found an incidental observable behavior:
selectors can match private artifact marker metadata for nonportable options.
The ADR explicitly authorizes its removal while preserving portable structural
matching and opaque presence/absence; it does not silently widen matching into
callback-containing values.

Design audit iteration 1 corrected two possible preservation mistakes: staging
all additions must not expose future batches to selectors, and direct option
access must not reveal nonportable contents. It also distinguished private
protocol-envelope checks from required nominal membership/provenance checks.
Design audit iteration 2 checked the complete proposed diff against both direct
IR consumers, registry publication, the canonical command graph, inert Typegen
projection and existing compilation-integrity/conformance tests. It retains
snapshot semantics, public diagnostics, contextual normalization, relationship
validation and runtime-option timing; obsolete envelope tests must transfer
live invariants before removal. No production file, previously accepted ADR or public export was edited.
Post-approval audit iteration 3 confirms that the accepted text matches the
presented proposal, the historic decisions remain intact, and the separate
resolver cleanup is scheduled before 3106. No unresolved finding remains.

Validation: all 14 backlog/active-contract tests pass; all relative Markdown
links resolve; Prettier and `git diff --check` pass. Source/type/build/coverage
checks were already green for the preceding 3104 commit and were not rerun for
this documentation-only proposal. Remote main was fetched before selecting
3105: local main is five commits ahead, none behind (one earlier planning
commit plus four issue commits).

Documentation impact: internal engineering documentation. This decision changes
no runtime yet. Issue 3106 must update Core's
engineering sources, schema examples and the affected website explanation for
the explicit selector delta; 3111 is not a substitute for that same-issue update.

User decision: accepted. The retention/superseding branch of the acceptance
criteria is not applicable; preservation requirements remain hard gates for 3106. Mechanical checks are repeated on the accepted text before the dedicated
local commit. Production delta: zero. No implementation exceeds this issue's
scope. No push.
