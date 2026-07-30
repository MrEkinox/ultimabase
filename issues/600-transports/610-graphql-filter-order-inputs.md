# 610: Generate GraphQL filters and ordering

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql`
- Depends on: 302, 303, 304, 609
- ADR: ADR-0004, ADR-0010

## Goal

Generate typed filter and ordering inputs and normalize them into Query AST.

## Acceptance criteria

- [ ] Operators reflect field kinds.
- [ ] Logical nesting is supported.
- [ ] Invalid combinations fail GraphQL validation before Runtime.

## Tests

- [ ] AST equivalence with class queries.
