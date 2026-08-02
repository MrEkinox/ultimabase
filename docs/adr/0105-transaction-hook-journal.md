# ADR-0105: Transaction hook finalization journal

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0015, ADR-0068, ADR-0089, ADR-0099, ADR-0100

## Context

Native finalization hooks need the complete outcome of an outer transaction,
not the momentary state of one pipeline operation. An explicit transaction may
contain multiple schemas and concurrent operations, while automatic mutations
must use the same behavior. Running `afterCommit` per operation would release
effects before the adapter commits. Independent queues for schema hooks, field
hooks, and low-level events could also disagree about order or rollback state.

## Decision

Runtime creates one private transaction hook journal for each outer adapter
transaction. An operation reserves its order synchronously when it enters the
transaction pipeline. The journal then retains its final immutable operation,
public result, semantic field changes, or original failure and phase.

The journal never persists data and never exposes adapter materializations. A
validated mutation outcome is reduced once to the public result and the field
changes required by lifecycle hooks. Reads may appear in failure diagnostics,
but they do not participate in commit summaries.

Finalization uses this order:

```text
settle every started operation
→ beforeCommit once per participating schema
→ adapter commit
→ field and schema afterCommit in reserved operation order
→ low-level post-commit events
```

`beforeCommit` receives all successful mutations for its exact schema in global
reservation order and may abort the transaction. The phrase “once per outer
transaction” in ADR-0089 therefore means at most one invocation of each
participating schema declaration, not one application-global callback.

On a pre-commit failure, Runtime attempts adapter rollback first.
`afterRollback` runs only after that rollback succeeds. `onError` then receives
the original failure phase and a discriminated final state: no transaction,
confirmed rollback, failed rollback, or already committed. Observer failures
are secondary errors; they never replace the initiating failure or trigger a
rollback after commit. Post-commit observers continue in stable order so one
failed observer does not suppress unrelated committed-state delivery.

The request transaction engine is closed before finalization effects run.
Captured engines therefore reject escaped queries, and no finalization input
exposes commit, rollback, adapter, or credential capabilities. A later ADR may
refine the safe capability surface when `HookContext` is implemented.

## Consequences

- Automatic and explicit transactions share one lifecycle implementation.
- Concurrent operation completion cannot reorder finalization effects.
- Set-based update and delete retain schema-level summaries without hidden row
  materialization or fabricated field changes.
- Rollback metadata reports only adapter-confirmed state.
- The journal adds bounded in-memory state for the duration of one transaction
  and releases it afterward.
