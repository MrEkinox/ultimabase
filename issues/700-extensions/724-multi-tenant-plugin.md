# 724: Add tenant isolation plugin

- Status: planned
- Milestone: 7+
- Packages: future multi-tenant package
- Depends on: 617
- ADR: new ADR required

## Goal

Compile non-bypassable tenant isolation into every database operation.

## Acceptance criteria

- [ ] Master does not bypass isolation by default.
- [ ] Cross-tenant relation and bulk operations are rejected.
