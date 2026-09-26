# 4003: Compile declaration privilege access once

- Status: planned
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4002
- ADR: none

## Goal

Remove repeated manifest privilege lookup and activation checks from the
declaration host while preserving effect-time privilege enforcement.

## Acceptance criteria

- [ ] One private owner-local view resolves declaration privilege access.
- [ ] Conditional activation, denial, owner attribution, and diagnostics remain
      unchanged.
- [ ] Every existing declaration facade remains available only under its exact
      privilege.
- [ ] Handwritten production lines decrease and focused tests pass.
- [ ] Documentation impact is recorded.
