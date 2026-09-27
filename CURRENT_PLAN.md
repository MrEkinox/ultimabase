# Current plan: Request-engine derivation

- Status: completed
- Milestone: 56
- Baseline: `1772b024`
- Completed issue: 5601

The user authorized the next debt-reduction pass after milestone 55. The audit
rejected merging PostgreSQL request dispatch, mutation preparation, and SQL
execution because accepted transaction and persistence-plan ADRs require those
phases to remain distinct. It rejected compressing `WhereBuilder` because the
apparent repetition carries public generic signatures and editor documentation.
It also proved that removing Password Auth's explicit operation annotations
would violate the repository's `isolatedDeclarations` build contract; changing
that authoring boundary requires a separate architecture decision.

The selected debt is internal RequestEngine derivation. Four sites repeat the
same private constructor wiring for context, Master, schema-mutation, and
transaction variants, while two private hosts repeat the same transaction
callback and optional lifetime. Consolidate only those facts. Exact application
identity, context, pipeline, transaction lifetime, authority, auditing,
cancellation, and execution semantics remain unchanged. The implementation
must delete production lines overall and add no public API.

No push is authorized.

## Outcome

One private derivation method now owns the four internal RequestEngine variants,
and both private command hosts reuse one transaction callback and optional
lifetime description. Production TypeScript adds 27 lines and removes 40, a
net reduction of 13. `request-engine.ts` falls from 531 to 518 lines with no
public API or behavior change.
