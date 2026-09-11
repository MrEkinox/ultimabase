# 2706: Prove public relation-filter parity

- Status: ready
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`, `@ultimabase/graphql-yoga-plugin`, `@ultimabase/postgres-plugin`, examples
- Depends on: 2705
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Prove that one relation declaration produces identical visible-membership
semantics through public TypeScript, REST, networkless GraphQL, Yoga, and live
PostgreSQL.

## Acceptance criteria

- [ ] The public example declares at least one static filter and one
      authentication-context-dependent filter without adding transport code.
- [ ] Direct relation handles, REST relationship projections, GraphQL relation
      connections, networkless GraphQL, and Yoga return the same filtered rows,
      counts, existence results, and nested inclusions.
- [ ] Caller filters, GraphQL cursor normalization, REST offset/limit, ordering,
      selection, and relation filters compose without changing Core pagination
      ownership.
- [ ] Anonymous, authenticated, and Master requests demonstrate the declared
      context behavior while Access and ACL independently protect hidden rows.
- [ ] Live PostgreSQL covers owning, inverse relation, inverse pointer,
      predicates, filtered cardinality, eager inclusion, and mutation-result
      projection without N+1 execution.
- [ ] Hard relation membership mutations and nested writes affect physical edges
      even when their targets are excluded from subsequent filtered reads.
- [ ] Typegen-free JavaScript and packed public packages execute the same source
      declaration without generated callbacks or deep imports.
- [ ] Public READMEs and the minimal example explain shaping versus security,
      Master behavior, synchronous callbacks, and v1 exclusions.

## Tests

- [ ] Cross-transport and PostgreSQL Testcontainers suites compare exact public
      results and query-count evidence.
- [ ] Packed-package, no-Typegen JavaScript, generated TypeScript, and
      language-service tests pass.

## Out of scope

- A transport-owned relation filter syntax, async callbacks, or source-item
  dependent filters.
