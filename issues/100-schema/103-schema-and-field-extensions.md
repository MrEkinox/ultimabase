# 103: Add typed schema and field extensions

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Allow plugins to contribute typed opaque configuration without Schema knowing concrete features.

## Acceptance criteria

- [x] Extension names and config types remain literal.
- [x] Duplicate extension policy is explicit.
- [x] Schema and field extensions share a consistent contract.
- [x] Extensions are inspectable without unsafe casts.

## Tests

- [x] A fixture plugin contributes an extension without changing Schema.

## Implementation notes

- Schema and field extensions share one discriminated `ExtensionDefinition` contract.
- Duplicate names fail within one scope; schema and field namespaces remain independent.
- Factories copy and shallow-freeze opaque config objects without interpreting them.
