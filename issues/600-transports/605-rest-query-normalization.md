# 605: Normalize REST queries to Query AST

- Status: superseded
- Superseded by: 2307
- Milestone: 6
- Packages: `@ultimabase/rest-plugin`
- Depends on: 301, 302, 303, 304, 305, 603
- ADR: ADR-0004

## Goal

Parse filters, selections, order, limit, skip, and cursors without executing them.

## Acceptance criteria

- [ ] Simple GET and complex POST query forms share normalization.
- [ ] Limits and malformed operators return validation errors.
- [ ] No transport-specific node enters Query AST.

## Tests

- [ ] Parser matrix and class-API AST equivalence tests.
