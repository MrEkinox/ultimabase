# 418: Execute the native Access lifecycle

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 329, 330, 331, 334, 337, 344, 417
- ADR: ADR-0089, ADR-0099, ADR-0100, ADR-0102, ADR-0104, ADR-0111, ADR-0116

## Goal

Execute every compiled Access level through Core's monotonic enforcement and
transaction pipeline before business hooks can observe or affect protected
data.

## Acceptance criteria

- [ ] Operation rules run after structural validation and before effectful business hooks for every compatible terminal.
- [ ] Synchronous and asynchronous decisions run sequentially with cancellation, recursion protection, sanitized diagnostics, and no post-denial business effect.
- [ ] Access filters constrain reads, counts, update targets, delete targets, and upsert conflict targets in the database request without entering the transformable Query AST.
- [ ] `beforeFind` may add business predicates but cannot inspect, replace, or remove an Access filter.
- [ ] Create item rules receive exact create input; singular update and delete item rules receive the prepared target; upsert receives both candidates and enforces the executed branch.
- [ ] Set-based update and delete never materialize rows silently for item rules and fail with a typed capability error when operation and filter access cannot fully protect the terminal.
- [ ] Explicit future itemized terminals run item access once per object inside their documented transaction grouping.
- [ ] Forbidden mutation fields reject the whole operation; default reads omit forbidden fields before output hooks; explicit selection, filtering, or ordering of a forbidden field fails clearly.
- [ ] Final field restrictions run after business result transforms and cannot be restored by a hook.
- [ ] Row denial is indistinguishable from non-existence for reads and target-filtered mutations, while operation denial produces a typed access error.
- [ ] Access remains active for every currently implemented direct Query, model command, nested-hook, and internal execution path; future transports, relations, and jobs must enter through the same engine contract.
- [ ] No concrete CLP, ACL, role, user, ownership, or field-permission name enters Runtime contracts or diagnostics.

## Tests

- [ ] Runtime matrices cover every terminal, automatic transactions, rollback, cancellation, nested hooks, master behavior, and no-policy applications.
- [ ] Security regressions prove business hooks cannot widen rows, restore fields, observe forbidden input, or infer filtered object existence.
- [ ] Bulk tests prove set-based behavior and explicit itemized capability errors without unbounded materialization.

## Out of scope

- Database-specific predicate compilation.
- Concrete permission-provider packages.
