# 401: Define declarative access-rule AST

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 103, 350
- ADR: ADR-0006, ADR-0113

## Goal

Represent allow, deny, authenticated, role, ownership, and logical rules without runtime or SQL coupling.

## Acceptance criteria

- [ ] Rule functions are synchronous and return declarative rules.
- [ ] Rules are immutable discriminated unions.
- [ ] Unknown custom rules require registered compilers.
- [ ] Authenticated and user subjects are access-plugin concepts resolved from optional typed context providers, not Core authority modes.

## Tests

- [ ] Composition and exhaustive matching tests.
