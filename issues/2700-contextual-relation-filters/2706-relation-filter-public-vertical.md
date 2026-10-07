# 2706: Prove public relation-filter parity

- Status: completed
- Milestone: 27
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`, `@ultimabase/graphql-yoga-plugin`, `@ultimabase/postgres-plugin`, examples
- Depends on: 2705
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Prove that one relation declaration produces identical visible-membership
semantics through public TypeScript, REST, networkless GraphQL, Yoga, and live
PostgreSQL.

## Acceptance criteria

- [x] The public example declares at least one static filter and one
      authentication-context-dependent filter without adding transport code.
- [x] Direct relation handles, REST relationship projections, GraphQL relation
      connections, networkless GraphQL, and Yoga return the same filtered rows,
      counts, existence results, and nested inclusions.
- [x] Caller filters, GraphQL cursor normalization, REST offset/limit, ordering,
      selection, and relation filters compose without changing Core pagination
      ownership.
- [x] Anonymous, authenticated, and Master requests demonstrate the declared
      context behavior while Access and ACL independently protect hidden rows.
- [x] Live PostgreSQL covers owning, inverse relation, inverse pointer,
      predicates, filtered cardinality, eager inclusion, and mutation-result
      projection without N+1 execution.
- [x] Hard relation membership mutations and nested writes affect physical edges
      even when their targets are excluded from subsequent filtered reads.
- [x] Typegen-free JavaScript and packed public packages execute the same source
      declaration without generated callbacks or deep imports.
- [x] Public READMEs and the minimal example explain shaping versus security,
      Master behavior, synchronous callbacks, and v1 exclusions.

## Tests

- [x] Cross-transport and PostgreSQL Testcontainers suites compare exact public
      results and query-count evidence.
- [x] Packed-package, no-Typegen JavaScript, generated TypeScript, and
      language-service tests pass.

## Completion evidence

- The minimal application now declares static filters on owning and inverse
  relation storage plus a Password Auth-contextual `reviewers` view. Its Author
  Access filter and ACL independently prove that shaping never grants access;
  Master bypasses those policies while retaining the declared relation subset.
- One public Testcontainers vertical compares direct handles, eager inclusion,
  REST projections, networkless GraphQL, and Yoga across anonymous,
  authenticated, and Master contexts. Caller predicates, ordering, REST
  offset/limit, Relay cursors, relation predicates, count, and exists all
  observe the same visible membership.
- PostgreSQL covers owning joins, inverse joins, inverse pointers, contextual
  predicates, cardinality, mutation-result projection, and a grouped inclusion
  over multiple parents in one `SELECT`. Raw join-table evidence proves a
  nested connect creates an edge hidden from reads and a direct disconnect
  removes that physical edge.
- A child-process JavaScript fixture executes static and contextual declarations
  against PostgreSQL from built package exports without a generated Typegen
  file. The committed minimal declarations, packed Typegen language-service
  fixture, and callback-free snapshot checks also pass.
- `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`,
  `yarn test:e2e:built`, `yarn constraints`, `yarn check:issues`,
  `yarn format:check`, and `git diff --check` passed. The complete unit, type,
  browser, and performance suite passed 2,354 tests in 503 files; the complete
  built E2E suite passed 346 tests in 86 files. Lint reported only the existing
  centralized line-budget warnings.

## Out of scope

- A transport-owned relation filter syntax, async callbacks, or source-item
  dependent filters.
