# 505: Compile Query AST filters

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 302, 303, 502, 503
- ADR: ADR-0004, ADR-0007

## Goal

Translate normalized filters into parameterized Drizzle/SQL expressions.

## Acceptance criteria

- [ ] Every primitive operator is supported.
- [ ] User values are always parameterized.
- [ ] Regex behavior and escaping are documented.

## Tests

- [ ] Operator conformance and injection regression tests.
