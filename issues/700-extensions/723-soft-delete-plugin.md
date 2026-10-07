# 723: Add soft-delete plugin

- Status: superseded
- Milestone: 7+
- Packages: future `@ultimabase/soft-delete-plugin`
- Depends on: 617, 1509
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193
- Superseded by: 2601

Milestone 26 supersedes this replace-only proposal. It retains the physical
delete rewrite described below, while also deciding schema-local opt-in, an
explicit `softDelete` mutation, generic Access and Hooks participation, REST
and GraphQL exposure, and private administrative restore and purge commands.
The original proposal remains below as historical context.

## Goal

Contribute recoverable-deletion behavior through the public plugin kernel. Keep
the developer-visible logical operation as `delete`, rewrite only its physical
persistence plan to an update, and enforce default visibility through a generic
protected Runtime constraint without adding a soft-delete branch to Core or the
developer Query AST.

## Acceptance criteria

- [ ] Default reads exclude deleted rows.
- [ ] Logical delete Access, hooks, audit, relation behavior, and result semantics remain delete semantics even though persistence performs an update.
- [ ] The visibility predicate works without an Access engine and composes
      monotonically with an installed policy engine, ACL, tenant isolation,
      relations, counts, and developer predicates.
- [ ] Business hooks cannot inspect or remove the private soft-delete visibility filter.
- [ ] Master restore remains explicit and audited.

## Tests

- [ ] Runtime, Typegen, no-Typegen JavaScript, conformance, and PostgreSQL suites cover delete, restore, purge, default visibility, relations, itemized batches, rollback, and application isolation.
- [ ] Policy matrices cover no Access engine, official Access, an alternative policy engine, ACL, and Master without changing logical delete semantics.

## Out of scope

- Adding a soft-delete operation or branch to Core.
- Choosing reusable-value and partial-unique-index policy without a focused ADR.
