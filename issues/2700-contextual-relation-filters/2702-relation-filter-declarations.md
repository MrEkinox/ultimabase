# 2702: Declare typed relation filters

- Status: ready
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2701
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Add the exact public relation-field `where` declaration while keeping compiled
schema metadata inert and executable callbacks private to the application.

## Acceptance criteria

- [ ] `field.relation({ where })` accepts the ADR's target-typed static filter or
      synchronous contextual resolver and preserves the existing `target`,
      `mappedBy`, and direct field-option contracts.
- [ ] The contextual input exposes only the exact immutable `RequestContext` and
      target `WhereBuilder`; its return type is exact and contains no `any`.
- [ ] Target names, filter fields, operators, nested relationship predicates,
      and callback returns retain precise generated autocomplete and hover docs.
- [ ] Runtime source definitions retain executable callbacks privately, while
      schema compiler IR, snapshots, fingerprints, and Typegen outputs contain
      no callback code or captured context.
- [ ] Untyped JavaScript rejects unknown fields, invalid operators, asynchronous
      returns, foreign builders, mutable inputs, and malformed declarations
      before database work.
- [ ] Circular target declarations, two applications using one schema class,
      and Typegen-free applications preserve application-local behavior.
- [ ] Core schema documentation and examples demonstrate static and contextual
      filters and clearly distinguish shaping from authorization.

## Tests

- [ ] Runtime declaration tests cover immutability, callback retention,
      invalid inputs, circular schemas, and application isolation.
- [ ] Compile-time and language-service tests cover exact target inference,
      autocomplete, invalid fields/operators, source and packed exports, and
      generated declarations.

## Out of scope

- Executing the filter, changing relation reads, or modifying an adapter or
  transport.
