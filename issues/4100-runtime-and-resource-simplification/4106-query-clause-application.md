# 4106: Consolidate Query clause application

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4105

## Goal

Make object inputs, `QueryBuilder`, and `WhereBuilder` reuse existing canonical
clause-to-AST mechanics without changing their public representations.

## Acceptance criteria

- [x] Selection, inclusion, ordering, pagination, and filter semantics retain
      exact inference, immutability, diagnostics, and serialized shapes.
- [x] Repeated normalize/serialize round trips are removed only where the same
      existing AST boundary can be used directly.
- [x] No new public query form, terminal, or compatibility facade is added.
- [x] Production lines decrease and source/packed language-service tests pass.
- [x] Documentation impact is recorded.

## Architecture stop

Stop before implementation if consolidation requires changing the public query
input, Query AST, Runtime execution ownership, or transport normalization.

## Outcome

`QueryBuilder.build()` now delegates to the same private clause serializer used
by nested relation and pointer projections. `WhereBuilder` input reuses its
already-normalized immutable expression directly instead of serializing it and
normalizing it again. The public inputs, AST, inference, diagnostics, and
transport/runtime boundaries are unchanged.

The change removes 34 net handwritten production lines. Focused runtime tests,
type tests, source and built-package language-service tests, Core typechecking,
package build checks, lint, and formatting pass.

Documentation impact: internal engineering documentation. Public Query forms
and behavior remain identical, so the existing Core README and website Query
documentation remain accurate.
