# 4004: Simplify schema declaration staging

- Status: planned
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4003
- ADR: none

## Goal

Consolidate repeated schema add/claim staging mechanics inside the existing
transactional declaration registry without introducing a generic registry.

## Acceptance criteria

- [ ] Add and claim share their common normalization and staging path.
- [ ] Their distinct root-membership, ownership, duplicate, and diagnostic
      semantics remain unchanged.
- [ ] Atomic publication and application-local schema identity remain intact.
- [ ] Handwritten production lines decrease and focused tests pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Generalizing field, schema, model, and private-storage declarations behind
  one registry abstraction.
