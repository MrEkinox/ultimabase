# 302: Add primitive filter operators

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 301
- ADR: ADR-0004, ADR-0053

## Goal

Add equality, comparisons, membership, string matching, regex, and existence nodes.

## Acceptance criteria

- [x] Operators are restricted by field kind.
- [x] Values match inferred field types.
- [x] Regex remains data, not executable code.

## Tests

- [x] Type matrix covers allowed and forbidden operator/field pairs.
