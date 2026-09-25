# 3304: Remove redundant static registrations

- Status: planned
- Milestone: 33
- Packages: `@ultimabase/core`
- Depends on: 3303
- ADR: ADR-0269

## Goal

Derive operation declarations, consumed Typegen references, and other
identity-complete static facts from their canonical contributions.

## Acceptance criteria

- [ ] Operation owners do not manually redeclare contributed operations.
- [ ] Typegen references reachable from owned command contracts are collected once with exact owner provenance.
- [ ] Contribution IDs are derived whenever owner plus nominal protocol identity is already unique.
- [ ] Explicit IDs remain available only where multiple same-protocol contributions require them.
- [ ] Schema, model, private-storage, field, and option declarations retain their complete current power.

## Tests

- [ ] Compilation, provenance, Typegen, collision, and privilege-denial tests pass.

## Handoff

- Documentation impact: pending.
