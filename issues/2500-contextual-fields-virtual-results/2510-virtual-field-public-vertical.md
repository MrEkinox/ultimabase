# 2510: Prove the public virtual-field vertical

- Status: planned
- Milestone: 25
- Packages: all packages changed by milestone 25
- Depends on: 2508, 2509
- ADR: proposed ADR-0244

## Goal

Prove one public application can declare, generate, persist dependencies, and
resolve identical virtual results through direct TypeScript, REST, GraphQL, and
Yoga.

## Acceptance criteria

- [ ] The minimal public application declares stored object fields with truthful
      embedded autocomplete plus primitive, structured, nullable, list,
      context-dependent, and asynchronous virtual fields.
- [ ] Source and generated TypeScript infer exact resolver items and public
      results while Typegen-free JavaScript executes from the same declarations.
- [ ] Direct queries, singular mutation results, nested-write results, REST,
      networkless GraphQL, and Yoga return equivalent logical values from one
      PostgreSQL-backed application.
- [ ] Anonymous, plugin-authenticated, and Master contexts can produce deliberate
      presentation differences without changing authorization or leaking private
      dependencies.
- [ ] Access denial, invalid outputs, rejected promises, cancellation, and late
      mutation resolver errors fail safely and roll back where required.
- [ ] Large bounded collections demonstrate stable order and the accepted async
      concurrency ceiling without an accidental unbounded fan-out.
- [ ] Two applications sharing schema declarations, providers, or HTTP
      infrastructure retain separate plugin graphs, contexts, and resolver
      attribution.

## Tests

- [ ] Public source, generated, no-Typegen JavaScript, browser Fetch, networkless
      GraphQL, Yoga, archive, performance, and PostgreSQL E2E suites pass.
- [ ] Relevant package export, `attw`, `publint`, and language-service checks pass.

## Out of scope

- Adding SDK, OpenAPI, cache, realtime, batching, or a new example application
  unrelated to the existing public vertical.
