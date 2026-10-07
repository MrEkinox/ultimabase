# 2702: Declare typed relation filters

- Status: completed
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2701
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Add the exact public relation-field `where` declaration while keeping compiled
schema metadata inert and executable callbacks private to the application.

## Acceptance criteria

- [x] `field.relation({ where })` accepts the ADR's target-typed static filter or
      synchronous contextual resolver and preserves the existing `target`,
      `mappedBy`, and direct field-option contracts.
- [x] The contextual input exposes only the exact immutable `RequestContext` and
      target `WhereBuilder`; its return type is exact and contains no `any`.
- [x] Target names, filter fields, operators, nested relationship predicates,
      and callback returns retain precise generated autocomplete and hover docs.
- [x] Runtime source definitions retain executable callbacks privately, while
      schema compiler IR, snapshots, fingerprints, and Typegen outputs contain
      no callback code or captured context.
- [x] Untyped JavaScript rejects unknown fields, invalid operators, asynchronous
      returns, foreign builders, mutable inputs, and malformed declarations
      before database work.
- [x] Circular target declarations, two applications using one schema class,
      and Typegen-free applications preserve application-local behavior.
- [x] Core schema documentation and examples demonstrate static and contextual
      filters and clearly distinguish shaping from authorization.

## Tests

- [x] Runtime declaration tests cover immutability, callback retention,
      invalid inputs, circular schemas, and application isolation.
- [x] Compile-time and language-service tests cover exact target inference,
      autocomplete, invalid fields/operators, source and packed exports, and
      generated declarations.

## Completion evidence

- Relation fields now expose exact static `WhereInput` and synchronous
  `{ context, where }` resolver types while retaining the executable source in
  a private field capability rather than portable field metadata.
- Application compilation resolves each target before normalizing and caching
  static filters. The contextual-result boundary rejects thenables, foreign
  builders, malformed values, unknown fields, and invalid operators while
  detaching accepted inputs into immutable Query expressions.
- Runtime tests cover source snapshots, circular targets, two applications,
  invalid declarations and contextual results. Type tests and language-service
  tests cover exact fields, operators, nested relations, callback inputs,
  generated declarations, JSDoc, and the packed Core export.
- `yarn typecheck`, `yarn test`, `yarn lint` with a 6144 MiB heap, and
  `yarn build` passed. The full suite passed 2,335 tests in 498 files; lint
  reported only the existing line-budget warnings. The packed Core field
  builder suite passed 8 tests.

## Out of scope

- Executing the filter, changing relation reads, or modifying an adapter or
  transport.
