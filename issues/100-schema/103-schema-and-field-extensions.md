# 103: Add typed schema and field extensions

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Allow plugins to contribute typed opaque configuration without Schema knowing concrete features.

## Acceptance criteria

- [ ] Extension names and config types remain literal.
- [ ] Duplicate extension policy is explicit.
- [ ] Schema and field extensions share a consistent contract.
- [ ] Extensions are inspectable without unsafe casts.

## Tests

- [ ] A fixture plugin contributes an extension without changing Schema.
