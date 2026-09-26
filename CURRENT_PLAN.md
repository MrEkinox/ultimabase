# Current plan: Access mutation traversal consolidation

- Status: completed
- Milestone: 47
- Baseline: `41238317`
- Current issue: completed

The user authorized the next debt reduction after milestone 46. Access still
decoded normalized update expressions beside Core's canonical field traversal,
rescanned every materialized value for every affected field, and traversed
static transition rules more than once.

Issue 4701 converges those paths on Core's existing traversal, isolates bulk
items through their canonical item index, and indexes values once per snapshot.
Prepared and materialized upsert checks remain separate, and no public API or
authorization semantics change.

Issue 4701 is complete. Access now has one canonical mutation-field traversal,
one indexed correlation pass for materialized values, and single-pass relation
and static transition decisions. Production is 41 lines smaller,
`mutation-transitions.ts` is back under its warning budget, and all 2,574
repository tests pass. No resume point remains.

No push is authorized.
