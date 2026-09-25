# 3304: Remove redundant static registrations

- Status: completed
- Milestone: 33
- Packages: `@ultimabase/core`
- Depends on: 3303
- ADR: ADR-0269

## Goal

Derive operation declarations, consumed Typegen references, and other
identity-complete static facts from their canonical contributions.

## Acceptance criteria

- [x] Operation owners do not manually redeclare contributed operations.
- [x] Typegen references reachable from owned command contracts are collected once with exact owner provenance.
- [x] Contribution IDs are derived whenever owner plus nominal protocol identity is already unique.
- [x] Explicit IDs remain available only where multiple same-protocol contributions require them.
- [x] Schema, model, private-storage, field, and option declarations retain their complete current power.

## Tests

- [x] Compilation, provenance, Typegen, collision, and privilege-denial tests pass.

## Handoff

- Documentation impact: both. Core and Typegen package contracts plus the
  website authoring guides now document automatic provider IDs and reachable
  command-reference collection.
- Operation contributions already derive their declaration and protocol IDs.
  Generic capability providers now default to their nominal capability ID;
  authors provide an explicit ID only for repeated providers of one token.
- Owned operation and schema-mutation contracts automatically register their
  reachable Typegen references when the owner requests `typegen:reference`.
  Standalone references retain the explicit registrar, and foreign ownership
  still grants no import authority.
- Validation: Core and Typegen package typechecks; full Core and Typegen suites;
  focused capability, Typegen-reference provenance, collision, and privilege
  tests; focused ESLint; Core package build.
