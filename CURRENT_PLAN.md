# Current plan: Access Runtime decision consolidation

- Status: completed
- Milestone: 46
- Baseline: `304a9c36`
- Current issue: completed

The user authorized the next debt reduction after milestone 45. Access still
classifies native operation families in separate item and filter switches,
repeats the same fail-closed schema-plan lookup in four places, and rebuilds the
same item-rule identity for every mutation branch.

Issue 4601 centralizes those existing invariants inside the Access package. The
prepared and materialized upsert checks remain separate because they protect
different moments of the database-selected branch. No public declaration,
Runtime stage, authority rule, or capability changes.

Issue 4601 is complete. Access now uses one operation-family classifier, one
fail-closed schema-plan reader, and one item-decision dispatcher. Production is
47 lines smaller, the previous `item-access.ts` warning is gone, all 2,573
repository tests pass, and no resume point remains.

No push is authorized.
