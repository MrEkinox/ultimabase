# ADR-0168: Operation Access hides terminal cardinality

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0116, ADR-0164

## Context

Schema `access.operation` declarations are already organized by public
capability: `create`, `update`, `upsert`, `delete`, and either one shared `read`
rule or explicit `one`, `many`, `count`, and `exists` read branches. Their
callback input nevertheless exposed the normalized Runtime terminal through
values such as `create-many`, `update-one`, or `find-many`.

That terminal is an execution detail rather than policy data. It duplicates the
declaration branch, encourages different authorization for equivalent object
operations, and makes internal cardinality refactors observable in the public
Access contract.

## Decision

`SchemaOperationAccessInput` contains only the effect-free `AccessContext`.
Schema operation callbacks expose no `kind` and no operation AST.

Developers distinguish read capabilities through the complete grouped form:
`one`, `many`, `count`, and `exists`. A concise read callback intentionally
applies to every read capability. `one` treats `get` and `findOne` identically.

Mutation declarations remain direct `create`, `update`, `upsert`, and `delete`
rules. Singular and collection execution use the same rule without disclosing
`-one` or `-many`. Runtime retains the exact terminal privately to select the
compiled rule and produce diagnostics.

This decision does not remove business discriminants from schema item Access,
field Access, or hooks. Those callbacks share contracts across materially
different materialized inputs and continue to receive their documented
business `kind` or disclosure `channel`.

## Consequences

- Operation authorization depends on public capabilities rather than adapter
  cardinality.
- `allOperations` and `allMutations` callbacks have one stable context-only
  input.
- Policies that differ between read cardinalities use the grouped read object.
- Item-sensitive mutation policy remains in `access.item`; database-enforceable
  target policy remains in `access.filter`.
- Internal operation nodes retain exact cardinality for execution, hooks, and
  diagnostics without leaking it through operation Access.
