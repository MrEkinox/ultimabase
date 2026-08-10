# Active plan: mutation relationship projections

- Status: active
- Started: 2026-08-10
- Objective owner: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Governing decision: [ADR-0180](docs/adr/0180-mutation-relationship-projections.md)
- Paused objective: [Generated schema authoring and type contracts](docs/plans/paused/generated-schema-authoring-and-type-contracts.md)

## Objective

Expose the generated nested `include` contract on `createOne`, `createMany`,
`updateOne`, and `updateMany`. Singular writes perform one transaction-bound
result projection. Itemized collection writes retain one lifecycle per item but
group their final relationship projection by persisted identifiers.

## Frozen constraints

- The object input remains the public and transport-neutral source of truth.
- Generated `inputs.include` types drive autocomplete and exact result shapes.
- Root mutation Access, resolveInput, and hooks execute exactly once per item.
- Included targets use the existing read Access, field restrictions, and nested inclusion pipeline without target schema hooks.
- Follow-up projection occurs inside the automatic mutation transaction and uses persisted IDs rather than mutable input predicates.
- Collection mutation results preserve declaration order independently from database return order.
- A collection include must not issue one root result read per item.
- Mutations without include perform no follow-up result query.
- Core remains adapter-neutral; PostgreSQL reuses Drizzle's relational query builder instead of custom relational SQL.
- Delete, upsert, nested writes, and transport-specific mutation shapes remain out of scope.
- Each issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

1. [x] [901 — Decide mutation relationship projection semantics](issues/900-mutation-projections/901-mutation-relationship-projection-adr.md)
2. [x] [902 — Project singular create and update results](issues/900-mutation-projections/902-singular-mutation-includes.md)
3. [x] [903 — Group collection mutation projections](issues/900-mutation-projections/903-grouped-mutation-includes.md)
4. [ ] [904 — Verify generated and PostgreSQL mutation include DX](issues/900-mutation-projections/904-mutation-includes-verification.md)

## Supervision checkpoints

- After 901: validate the precise projection timing and hook/Access boundaries.
- During 902: stop if an adapter-specific mutation include path would be required instead of a portable result read.
- During 903: stop if grouping requires changing the accepted item-oriented hook lifecycle.
- After 904: demonstrate the generated TypeScript DX and observed PostgreSQL query cardinality.

## Completion gate

- All four commands accept exact nested includes and return exact generated models.
- Singular and grouped collection projections run inside the mutation transaction.
- Runtime and PostgreSQL tests prove Access, hooks, ordering, rollback, and no-include fast paths.
- Source and packed language-service tests protect autocomplete and compact hovers.
- Core, codegen, PostgreSQL, E2E, typecheck, test, lint, constraints, and build checks pass.
