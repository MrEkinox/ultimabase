# 4106: Consolidate Query clause application

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4105

## Goal

Make object inputs, `QueryBuilder`, and `WhereBuilder` reuse existing canonical
clause-to-AST mechanics without changing their public representations.

## Acceptance criteria

- [ ] Selection, inclusion, ordering, pagination, and filter semantics retain
      exact inference, immutability, diagnostics, and serialized shapes.
- [ ] Repeated normalize/serialize round trips are removed only where the same
      existing AST boundary can be used directly.
- [ ] No new public query form, terminal, or compatibility facade is added.
- [ ] Production lines decrease and source/packed language-service tests pass.
- [ ] Documentation impact is recorded.

## Architecture stop

Stop before implementation if consolidation requires changing the public query
input, Query AST, Runtime execution ownership, or transport normalization.
