# 4401: Type shared logical Runtime stages

- Status: completed
- Milestone: 44
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Represent native database operations and plugin-owned schema mutations through
one exact logical-operation type at only the Runtime stages they already share.

## Acceptance criteria

- [x] Adapter and ordinary CRUD pipeline contracts remain database-operation-only.
- [x] Shared policy, behavior, result, and commit stages accept the closed logical union.
- [x] Mutation targets, outcomes, database results, and public results remain correlated.
- [x] Public exports and hover documentation make the distinction explicit.
- [x] Compile-time tests protect native and schema-mutation inference.
- [x] Documentation impact is recorded.

## Out of scope

- Combining native CRUD and schema-mutation execution.
- Adding another logical operation family or extension registry.
- Changing Runtime order, authority, transactions, persistence, or adapter input.

## Outcome

Core now exports `RuntimeLogicalOperationAst` and
`RuntimeLogicalOperationKind`, plus correlated logical mutation target,
outcome, database-result, and result contracts. Shared policy, relation,
before/after behavior, result, and commit stages accept the schema-mutation
identity they already received at Runtime. Native normalization, structural
validation, prepared transforms, `RuntimePipeline.execute()`, and database
execution remain database-operation-only.

Low-level interceptors and policy-neutral constraints may now explicitly
select `plugin-schema-mutation`; omitting `operations` preserves their existing
all-logical-operation behavior. One query reader owns the remaining normalized
database-AST assertion instead of repeating it in relation and result policy.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn workspace @ultimabase/core test:types`
- `git diff --check`

## Documentation impact

Both. The Core README and Runtime Pipeline website page now explain the closed
logical union and the unchanged physical adapter boundary.
