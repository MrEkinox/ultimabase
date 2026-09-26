# 4002: Centralize exact object option validation

- Status: planned
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4001
- ADR: none

## Goal

Replace repeated plain-object and exact-key loops with one neutral private Core
validator while preserving every caller-owned diagnostic.

## Acceptance criteria

- [ ] Existing option boundaries reuse one private implementation.
- [ ] Error text, symbol-key handling, and accepted keys remain unchanged.
- [ ] No public export or generalized schema/plugin facade is added.
- [ ] Handwritten production lines decrease and focused tests pass.
- [ ] Documentation impact is recorded.
