# 723: Add soft-delete plugin

- Status: planned
- Milestone: 7+
- Packages: future soft-delete package
- Depends on: 617
- ADR: new ADR required

## Goal

Contribute recoverable-deletion behavior plus a private native Access filter;
do not add a soft-delete branch to Runtime or the developer Query AST.

## Acceptance criteria

- [ ] Default reads exclude deleted rows.
- [ ] The visibility predicate composes monotonically with schema Access, ACL, tenant isolation, relations, counts, and developer predicates.
- [ ] Business hooks cannot inspect or remove the private soft-delete visibility filter.
- [ ] Master restore remains explicit and audited.
