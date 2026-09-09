# 2501: Decide contextual fields and virtual results

- Status: ready
- Milestone: 25
- Packages: architecture documentation
- Depends on: none
- ADR: proposed ADR-0244

## Goal

Accept one exact contract for context-sensitive field builders, output-only
value descriptions, and request-aware asynchronous virtual result fields before
implementation changes any public or Runtime boundary.

## Acceptance criteria

- [ ] ADR-0244 refines ADR-0165, ADR-0175, ADR-0140, and ADR-0161 without
      rewriting their accepted history.
- [ ] The ADR defines distinct stored-root, embedded-value, virtual-field, and
      output-value capability profiles with exact built-in and plugin option
      applicability.
- [ ] Embedded fields retain only behavior with portable occurrence semantics;
      unsupported index, relationship, dedicated-column, generation, and plugin
      declarations fail through matching type and Runtime boundaries.
- [ ] `OutputBuilder` has an exact scalar, list, enum, temporal, decimal, binary,
      JSON, and recursively structured object contract without mutation,
      storage, index, generator, or input-Hook semantics.
- [ ] `field.virtual({ output, select, resolve })` fixes output nullability and
      structure, flat persisted dependency selection, complete-result behavior,
      and generated result/selection typing while excluding every mutation
      input, filter, ordering, and persistence contract.
- [ ] Resolver input is the immutable exact dependency projection plus `id` and
      the real immutable `RequestContext`; unrelated public selection fields do
      not change resolver input.
- [ ] The ADR fixes when virtual Access, private dependency loading, structural
      output validation, resolver execution, final projection, mutation commit,
      cancellation, and error mapping occur.
- [ ] Synchronous and Promise results share one deterministic contract, including
      stable collection ordering and a bounded async resource policy.
- [ ] Callback-bearing resolver bindings remain Core-private and
      application-attributed while the public schema compiler IR stays
      callback-free and Typegen stays inert.
- [ ] REST and GraphQL map the same Core selection and value descriptor without
      transport-owned business resolution.
- [ ] Virtual dependencies, relationship traversal, filters, ordering,
      persistence pushdown, cross-request caching, side effects, and public
      batching remain explicitly outside v1.

## Tests

- [ ] `yarn check:issues`, focused documentation checks, `yarn format:check`,
      and `git diff --check` pass.

## Out of scope

- Changing a public TypeScript type, Runtime operation, adapter, transport, or
  generated declaration before the ADR is accepted.
