# 4103: Centralize enumerable-key validation

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4102

## Goal

Remove repeated `Object.keys()` exact-vocabulary loops through a private helper
that deliberately preserves enumerable-string-key semantics.

## Acceptance criteria

- [ ] Migrated boundaries keep their exact messages, validation order, and
      historical symbol-key behavior.
- [ ] The existing `Reflect.ownKeys()` helper remains distinct.
- [ ] Only exact-key loops migrate; semantic iteration remains local.
- [ ] Production lines decrease and focused regression tests pass.
- [ ] Documentation impact is recorded.
