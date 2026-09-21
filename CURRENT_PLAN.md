# Prepared plan: residual complexity simplification

- Status: planned — preparation complete; implementation not started
- Milestone: [31 — Residual complexity simplification](issues/3100-residual-complexity-simplification/README.md)
- Detailed plan: [execution and audit contract](docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](docs/plans/2026-09-21-residual-complexity-inventory.md)
- Baseline source: `265b54c909404f9690a666bdf39ace01ccee466e`
- Next issue after explicit start authorization: [3101](issues/3100-residual-complexity-simplification/3101-baseline-and-consumer-inventory.md)
- Hard stop: after issue 3112 and its dedicated local commit

## Current authorization

The user authorized preparing the new milestone, its issues and the mandatory
per-issue audit/correction loop. This preparation does not start implementation,
accept compiler/public-contract decisions, authorize a push or resume any feature.
Wait for explicit authorization before starting 3101.

Milestone 30 stays completed. Its [final audit](docs/plans/2026-09-21-milestone-30-final-audit.md)
and [archived execution log](docs/plans/completed/pre-feature-architecture-simplification-execution-log.md)
preserve the previous delivery. Historical start/stop/push statements do not
change this plan's current authorization. The paused ACL plan and suspended
Soft Delete work remain untouched.

## Mandatory execution gate

After start authorization, execute 3101 through 3112 sequentially and respect
every dependency. For each issue:

1. Implement only its approved scope and necessary tests/documentation.
2. Validate, then audit the complete diff for parity, security, ownership,
   public types/exports, obsolete paths, coverage, documentation and scope.
3. Correct every finding, rerun affected validation and repeat the complete
   audit until no unresolved finding remains. Passing tests alone is insufficient.
4. Stop and explain any architectural question, uncertain consumer, unapproved
   loss or blocked required verification; wait for the user's direction.
5. Record audit iterations and exactly one Documentation impact classification;
   update removal evidence and the root history without claiming planned work
   as delivered.
6. Create the dedicated local commit, inspect it and report exact added/deleted/net
   line counts, including tests/docs/generated files and separate production
   reductions. Only then may the next issue start. Do not push.

Preserve current functionality and used plugin capabilities. Issues 3105 and
3107 require explicit decisions before their dependent compiler/public removals.
A retained candidate explicitly supersedes its removal issue; a pending decision
blocks it. No generic replacement API or private official-plugin escape hatch.
An explicitly superseded removal is resolved by its decision issue's audited
commit, without a fake implementation or empty commit.

Public changes update the affected pages under `apps/website/content/docs` in
that same issue. Issue 3111 reviews the complete affected journey again.
Stop expressly after the final 3112 audit and commit; no automatic continuation.
