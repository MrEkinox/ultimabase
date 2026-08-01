# 505: Compile Query AST filters

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 302, 303, 502, 503
- ADR: ADR-0004, ADR-0007

## Goal

Translate normalized filters into parameterized Drizzle/SQL expressions.

## Acceptance criteria

- [x] Every primitive operator is supported.
- [x] User values are always parameterized.
- [x] Regex behavior and escaping are documented.

## Tests

- [x] Operator conformance and injection regression tests.
