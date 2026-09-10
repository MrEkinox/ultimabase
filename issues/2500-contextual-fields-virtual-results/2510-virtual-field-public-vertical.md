# 2510: Prove the public virtual-field vertical

- Status: completed
- Milestone: 25
- Packages: all packages changed by milestone 25
- Depends on: 2508, 2509
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Prove one public application can declare, generate, persist dependencies, and
resolve identical virtual results through direct TypeScript, REST, GraphQL, and
Yoga.

## Acceptance criteria

- [x] The minimal public application declares stored object fields with truthful
      embedded autocomplete plus primitive, structured, nullable, list,
      context-dependent, and asynchronous virtual fields.
- [x] Source and generated TypeScript infer exact resolver items and public
      results while Typegen-free JavaScript executes from the same declarations.
- [x] Direct queries, singular mutation results, nested-write results, REST,
      networkless GraphQL, and Yoga return equivalent logical values from one
      PostgreSQL-backed application.
- [x] Anonymous, plugin-authenticated, and Master contexts can produce deliberate
      presentation differences without changing authorization or leaking private
      dependencies.
- [x] Access denial, invalid outputs, rejected promises, cancellation, and late
      mutation resolver errors fail safely and roll back where required.
- [x] Large bounded collections demonstrate stable order and the accepted async
      concurrency ceiling without an accidental unbounded fan-out.
- [x] Two applications sharing schema declarations, providers, or HTTP
      infrastructure retain separate plugin graphs, contexts, and resolver
      attribution.

## Tests

- [x] Public source, generated, no-Typegen JavaScript, browser Fetch, networkless
      GraphQL, Yoga, archive, performance, and PostgreSQL E2E suites pass.
- [x] Relevant package export, `attw`, `publint`, and language-service checks pass.

## Completion evidence

- The minimal application now declares primitive, nullable, list, structured,
  asynchronous, context-aware, and Access-protected virtual results alongside a
  stored embedded object, with exact source and generated declarations.
- One PostgreSQL-backed E2E vertical proves equivalent nested mutation results
  through direct TypeScript, REST, networkless GraphQL, and Yoga without
  exposing privately selected dependencies.
- Anonymous, password-authenticated, and audited Master requests prove deliberate
  presentation differences. A 33-item collection proves stable asynchronous
  ordering across more than two resolver batches of 16.
- The public vertical exposed a mutation-result snapshot bug when the adapter
  returned private virtual dependencies. Runtime stages now receive an explicit
  physical returning selection for structural validation while the logical
  caller selection remains unchanged.
- Focused Runtime and declaration regression tests, the complete 466-file unit
  matrix with 2,230 tests, the 78-file E2E matrix with 313 tests, TypeScript,
  lint, formatting, build, package archives, `attw`, and `publint` pass.

## Out of scope

- Adding SDK, OpenAPI, cache, realtime, batching, or a new example application
  unrelated to the existing public vertical.
