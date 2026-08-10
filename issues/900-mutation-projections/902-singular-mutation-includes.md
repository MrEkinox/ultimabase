# 902: Project singular create and update results

- Status: done
- Milestone: 9
- Packages: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Depends on: 901
- ADR: [ADR-0180](../../docs/adr/0180-mutation-relationship-projections.md)

## Goal

Add exact `include` inputs and nested result typing to `createOne` and
`updateOne`, backed by one transaction-bound projection read by persisted ID.

## Acceptance criteria

- [x] `createOne` and `updateOne` accept the generated schema `include` contract.
- [x] Nested selections produce exact generated result types and autocomplete.
- [x] Runtime projects the persisted row by stable ID after the write.
- [x] Projection does not replay root Access, resolveInput, or schema hooks.
- [x] Included target Access and output processing match ordinary reads.
- [x] No extra result read occurs when `include` is absent.

## Tests

- [x] Compile-time and language-service tests cover exact nested mutation results.
- [x] Runtime tests prove lifecycle cardinality and denied target behavior.
- [x] PostgreSQL pointer, relation, and nested coverage is explicitly assigned to issue 904.

## Out of scope

- Collection projection grouping.
- Delete and upsert commands.
