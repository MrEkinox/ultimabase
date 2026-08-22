# 2102: Execute Standard Schema only on final mutation input

- Status: planned
- Milestone: 21
- Packages: `@ultimabase/core`, official examples and documentation
- Depends on: 2101
- ADR: ADR-0221

## Goal

Remove application-validator execution from every read and result boundary
while retaining one mandatory Standard Schema pass on final mutation input.

## Acceptance criteria

- [ ] Initial mutation validation remains structural and resolves Core defaults
      and generators without invoking Standard Schema.
- [ ] The mandatory final mutation stage invokes Standard Schema exactly once
      per complete present non-null field occurrence after all input transforms,
      even when no behavior plugin is installed or no value changed.
- [ ] Final mutation validation preserves generated operations, relation deltas,
      unique upsert targets, immutable-field rules, and value-dependent policy
      ordering without replaying defaults or generators.
- [ ] `increment` and `decrement` use the locked original target to project the
      complete canonical result after input transforms, then execute the field
      validator once on that projection.
- [ ] Arithmetic projection reuses Core's exact integer, bigint, float, and
      decimal update semantics, detects structural overflow or invalid decimal
      results before persistence, and adds no adapter query.
- [ ] The database adapter still receives the original atomic delta rather than
      a projected set operation, and the locked target prevents a concurrent
      write from invalidating the checked result.
- [ ] Read normalization, adapter output, behavior result replacement, mutation
      materialization, pointer and relation inclusion, and final selected-result
      validation execute structural snapshots without Standard Schema.
- [ ] Master authority cannot bypass the final mutation validator.
- [ ] Existing Standard Schema failure mapping, synchronous execution,
      transformation rejection, opaque identity, and canonical-value typing
      remain unchanged.
- [ ] Internal application-validation switches and helpers that no longer have
      two legitimate modes are removed or narrowed rather than retained as
      speculative configuration.
- [ ] Package READMEs, Runtime and Schema guides, Todo, and contributor pipeline
      documentation describe the one-pass contract.
- [ ] No public compatibility option or deprecated result-validation path is
      retained during pre-release development.

## Tests

- [ ] Invocation counters prove one call for create, update, upsert, defaults,
      generators, normalized values, lists, objects, pointers, and plugin fields.
- [ ] Integer, bigint, float, and decimal arithmetic tests prove the projected
      final value is validated once, while a valid delta producing an invalid
      final value fails before adapter execution.
- [ ] Reads, adapter results, materializations, includes, behavior result
      replacements, mutation outcomes, and final projections prove zero calls.
- [ ] Runtime ordering tests prove application validation remains after input
      resolution and before value-dependent enforcement and persistence.
- [ ] Source and packed declarations retain focused validator typing with no
      public execution-mode option.
- [ ] Narrow tests plus `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Removing structural validation from persisted results.
- Validating or migrating existing rows automatically after a validator change.
- Adding asynchronous or database-backed field validators.
- Generalizing arithmetic updates to non-numeric or plugin-defined field kinds.
