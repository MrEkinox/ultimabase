# 302: Add primitive filter operators

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301
- ADR: ADR-0004

## Goal

Add equality, comparisons, membership, string matching, regex, and existence nodes.

## Acceptance criteria

- [ ] Operators are restricted by field kind.
- [ ] Values match inferred field types.
- [ ] Regex remains data, not executable code.

## Tests

- [ ] Type matrix covers allowed and forbidden operator/field pairs.
