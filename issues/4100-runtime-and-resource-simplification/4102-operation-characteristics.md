# 4102: Centralize operation characteristics

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4101

## Goal

Derive repeated closed-operation classifications from one private canonical
description while retaining each consumer's focused predicate.

## Acceptance criteria

- [ ] Mutation, automatic-transaction, result-cardinality, nullability, and
      query-backed classifications have one internal source of truth where
      their current semantics are identical.
- [ ] Distinct classifications remain distinct instead of being flattened.
- [ ] No public operation kind, AST, result, or Runtime stage changes.
- [ ] Production lines decrease and exhaustive tests cover every operation kind.
- [ ] Documentation impact is recorded.
