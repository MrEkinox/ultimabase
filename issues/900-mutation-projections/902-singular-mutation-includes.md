# 902: Project singular create and update results

- Status: ready
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Depends on: 901
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Add exact `include` inputs and nested result typing to `createOne` and
`updateOne`, backed by one transaction-bound projection read by persisted ID.

## Acceptance criteria

- [ ] `createOne` and `updateOne` accept the generated schema `include` contract.
- [ ] Nested selections produce exact generated result types and autocomplete.
- [ ] Runtime projects the persisted row by stable ID after the write.
- [ ] Projection does not replay root Access, resolveInput, or schema hooks.
- [ ] Included target Access and output processing match ordinary reads.
- [ ] No extra result read occurs when `include` is absent.

## Tests

- [ ] Compile-time and language-service tests cover exact nested mutation results.
- [ ] Runtime tests prove lifecycle cardinality and denied target behavior.
- [ ] PostgreSQL tests prove pointer, relation, and nested includes.

## Out of scope

- Collection projection grouping.
- Delete and upsert commands.
