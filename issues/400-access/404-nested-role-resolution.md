# 404: Resolve nested roles and reject cycles

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 403
- ADR: ADR-0006

## Goal

Resolve transitive membership while preventing cyclic role graphs.

## Acceptance criteria

- [ ] Direct and inherited roles are distinguishable.
- [ ] Cycle creation fails before commit.
- [ ] Resolution is deterministic and duplicate-free.

## Tests

- [ ] Deep hierarchy, diamond, and cycle fixtures.
