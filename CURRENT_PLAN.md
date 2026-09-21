# Active plan: residual complexity simplification

- Status: in-progress — 3107 decisions accepted; next 3108
- Milestone: [31 — Residual complexity simplification](issues/3100-residual-complexity-simplification/README.md)
- Detailed plan: [execution and audit contract](docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](docs/plans/2026-09-21-residual-complexity-inventory.md)
- Measurements and retained IDs: [3101 baseline](docs/plans/2026-09-21-residual-complexity-baseline.md)
- Baseline source: `265b54c909404f9690a666bdf39ace01ccee466e`
- Current issue: [3108](issues/3100-residual-complexity-simplification/3108-remove-unused-runtime-stage-contributions.md)
- Hard stop: after issue 3112 and its dedicated local commit

## Current authorization

The user explicitly authorized autonomous execution of milestone 31 on
2026-09-21, with one dedicated commit per completed issue and the full
validation/audit/correction loop. Stop for questions, architectural decisions
or blockers and explain them before continuing. The exact compiler decision in 3105 was explicitly accepted on 2026-09-21,
including the selector delta and separate Core resolver cleanup. The user explicitly accepted the three separately presented public protocol
removals in 3107 on 2026-09-21, including the Typegen fixture convention and
used public migration-testing helper exceptions.
No push, later milestone or paused feature is authorized.

Milestone 30 stays completed. Its [final audit](docs/plans/2026-09-21-milestone-30-final-audit.md)
and [archived execution log](docs/plans/completed/pre-feature-architecture-simplification-execution-log.md)
preserve the previous delivery. Historical start/stop/push statements do not
change this plan's current authorization. The paused ACL plan and suspended
Soft Delete work remain untouched.

## Mandatory execution gate

Execute 3101 through 3112 sequentially and respect
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

Preserve current functionality and used plugin capabilities. Issue 3105 records its accepted decision;
3107 records the accepted ADR-0264/0265/0266 decisions for the dependent removals.
A retained candidate explicitly supersedes its removal issue; a pending decision
blocks it. No generic replacement API or private official-plugin escape hatch.
An explicitly superseded removal is resolved by its decision issue's audited
commit, without a fake implementation or empty commit.

Public changes update the affected pages under `apps/website/content/docs` in
that same issue. Issue 3111 reviews the complete affected journey again.
Stop expressly after the final 3112 audit and commit; no automatic continuation.

## Completed issue commits

- 3101: `4df180bc`, +391 / -69 = +322 lines; production delta 0.
- 3102: `040e7df1`, +114 / -372 = -258 lines; production -334.
- 3103: `4759aef3`, +177 / -164 = +13 lines; production -100.
- 3104: `ddeea4de`, +288 / -259 = +29 lines; production -164.

- 3105: `5bc6c90b`, +289 / -39 = +250 lines; production delta 0.

- 3102 follow-up: `75ed6561`, +39 / -65 = -26 lines; production -61.

- 3106: `a539cfc8`, +2,335 / -4,349 = -2,014 lines; production -2,256.

## Exact resume point

3101–3106 and the separately approved private Core resolver cleanup are committed.
Issue 3106 completed its audit loop: direct compilation removes 2,256
production lines, preserves public exports and retained coverage, and passes
2,795 coverage tests plus 384 built/packed/PostgreSQL tests. Its dedicated
commit is `a539cfc8`. The tree was clean before 3107 preparation.

3107 records three independently presented and explicitly accepted decisions:

- RC-04: [ADR-0264](docs/adr/0264-remove-unused-runtime-stage-contributions.md), remove only normalization/commit plugin stage definitions.
- RC-05: [ADR-0265](docs/adr/0265-remove-typegen-emitter-marker.md), remove the emitter marker, including its conditional-privilege fixture use and uniqueness convention.
- RC-06: [ADR-0266](docs/adr/0266-defer-migration-only-protocols.md), remove the exact migration scaffold and public `FakeAdapterMigrationHistory`; preserve physical provenance, direct synchronization/renames and private storage.

All three removals are approved, not yet implemented. After the dedicated 3107
commit, execute 3108, 3109 and 3110 in order, with a separate validation/audit
loop and commit per issue. Then audit the website in 3111 and complete the
final parity audit in 3112. Stop expressly after 3112; no push is authorized.
