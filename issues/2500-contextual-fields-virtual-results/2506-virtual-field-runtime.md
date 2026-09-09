# 2506: Resolve asynchronous virtual fields

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2505
- ADR: proposed ADR-0244

## Goal

Materialize selected virtual fields from private persisted dependency
projections through request-aware synchronous or asynchronous resolvers.

## Acceptance criteria

- [ ] Runtime preserves the caller-facing logical selection while deriving one
      private persisted selection equal to the union of requested stored fields
      and every requested virtual dependency.
- [ ] Each resolver receives an immutable item containing exactly its declared
      dependencies plus canonical `id`, independent from unrelated caller
      selections and without a Query, engine, adapter, or authority facade.
- [ ] The exact bound `RequestContext`, typed plugin values, source, metadata,
      authority mode, request ID, and cancellation signal reach the resolver
      without accepting transport-shaped or foreign contexts.
- [ ] Direct and Promise results use one structural output validation boundary;
      invalid values, throws, and rejections become safe operation failures.
- [ ] Collection resolution preserves result and field order under the bounded
      deterministic concurrency policy accepted by ADR-0244.
- [ ] Virtual field Access is enforced before its output is exposed, private
      dependencies never leak, and resolver conditions do not bypass protected
      policies or final output restrictions.
- [ ] Mutation projections resolve before commit so resolver failure rolls back
      the automatic transaction; reads retain their ordinary transaction policy.
- [ ] Callback attribution, nested application execution, cancellation,
      multi-application isolation, and complete-selection/exclusion semantics
      remain exact.

## Tests

- [ ] Focused Runtime tests cover singular, collection, mutation, exclusion,
      multiple virtuals, overlapping dependencies, async order, concurrency
      bounds, cancellation, rejection, invalid output, and dependency privacy.
- [ ] Access, Hooks, Validation, Master, nested-write, persistence rewrite, and
      transaction regressions prove no alternate lifecycle or authorization path.

## Out of scope

- Resolver side-effect guarantees, cross-request caching, public batching,
  relationship loading, virtual dependencies, filtering, or ordering.
