# 2506: Resolve asynchronous virtual fields

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2505
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Materialize selected virtual fields from private persisted dependency
projections through request-aware synchronous or asynchronous resolvers.

## Acceptance criteria

- [x] Runtime preserves the caller-facing logical selection while deriving one
      private persisted selection equal to the union of requested stored fields
      and every requested virtual dependency.
- [x] Each resolver receives an immutable item containing exactly its declared
      dependencies plus canonical `id`, independent from unrelated caller
      selections and without a Query, engine, adapter, or authority facade.
- [x] The exact bound `RequestContext`, typed plugin values, source, metadata,
      authority mode, request ID, and cancellation signal reach the resolver
      without accepting transport-shaped or foreign contexts.
- [x] Direct and Promise results use one structural output validation boundary;
      invalid values, throws, and rejections become safe operation failures.
- [x] Collection resolution preserves result and field order under the bounded
      deterministic concurrency policy accepted by ADR-0244.
- [x] Virtual field Access is enforced before its output is exposed, private
      dependencies never leak, and resolver conditions do not bypass protected
      policies or final output restrictions.
- [x] Mutation projections resolve before commit so resolver failure rolls back
      the automatic transaction; reads retain their ordinary transaction policy.
- [x] Eager pointer and relation target projections resolve their selected
      virtual fields through the same operation-local scheduler and independent
      target Access without lending parent dependencies or authority.
- [x] Callback attribution, nested application execution, cancellation,
      multi-application isolation, and complete-selection/exclusion semantics
      remain exact.

## Tests

- [x] Focused Runtime tests cover singular, collection, mutation, exclusion,
      multiple virtuals, overlapping dependencies, async order, concurrency
      bounds, cancellation, rejection, invalid output, and dependency privacy.
- [x] Access, Hooks, Validation, Master, nested-write, persistence rewrite, and
      transaction regressions prove no alternate lifecycle or authorization path.

## Completion evidence

- `yarn typecheck`, `yarn format:check`, `yarn constraints`,
  `yarn check:issues`, and `git diff --check` passed.
- `yarn test` passed 456 files and 2,199 tests after listener-backed suites were
  rerun with local-port access.
- `yarn lint` passed with only the repository's existing file-size warnings;
  the validation-boundary baseline decreased from 1,019 to 949 lines and the
  inclusion-projection baseline decreased from 708 to 660 lines.
- `yarn build` passed for every workspace, including `attw` and `publint`.
- Focused Runtime tests cover private dependency projection, direct and async
  output, fixed batches of 16, deterministic failure, cancellation, mutation
  ordering, eager targets, recursion, and application/plugin attribution.

## Out of scope

- Resolver side-effect guarantees, cross-request caching, public batching,
  relationship loading, virtual dependencies, filtering, or ordering.
