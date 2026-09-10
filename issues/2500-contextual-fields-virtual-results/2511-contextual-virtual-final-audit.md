# 2511: Audit and close contextual virtual fields

- Status: completed
- Milestone: 25
- Packages: all first-release packages
- Depends on: 2510
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Close the contextual-field and virtual-result milestone with complete repository
evidence and reconciled public, generated, Runtime, persistence, and transport
contracts.

## Acceptance criteria

- [x] Stored, embedded, virtual, and output builders expose only their accepted
      built-in and plugin capabilities through source, generated, built, and
      packed declarations.
- [x] Invalid untyped, stale, plugin-patched, or cross-context declarations fail
      before setup or infrastructure effects and are never silently ignored.
- [x] Virtual values use one Core declaration, dependency expansion, resolver,
      output validation, Access, cancellation, and error path across direct,
      REST, GraphQL, Yoga, read, mutation, and nested-write results.
- [x] PostgreSQL and migration artifacts contain no virtual storage while private
      dependency selections are minimal, deduplicated, and never exposed.
- [x] Async collection execution is bounded and deterministic; mutation failures
      roll back; contexts, Master provenance, callback attribution, application
      isolation, and final output restrictions remain exact.
- [x] Removal audits find no permissive embedded aliases, stored-field output
      descriptors, field `resolveOutput`, generated Runtime resolver, virtual
      input/filter/order path, transport resolver, database computation, deep
      import, `any`, mutable global registry, or file-budget regression.
- [x] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      generated declarations, package exports, and release scope describe the
      shipped contract and explicit v1 exclusions accurately.
- [x] The active plan is archived and milestone 25 is marked completed only after
      every issue and validation gate passes.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [x] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      browser Fetch, networkless GraphQL, Yoga, cross-transport, performance,
      concurrency, multi-application, and PostgreSQL Testcontainers E2E suites.

## Completion evidence

- Contextual source, generated, built, and packed declarations retain separate
  stored, embedded, virtual, and output capabilities. Runtime regressions reject
  stale, untyped, plugin-patched, and cross-context declarations before setup.
- Static removal audits and the complete test matrix confirm that virtual fields
  do not enter persistence, migrations, mutation inputs, filters, ordering,
  transport-local business resolvers, generated Runtime code, or mutable global
  registries. Public package imports remain free of deep `src/` paths and lint
  reports no `any` or file-budget regression.
- Direct TypeScript, REST, networkless GraphQL, Yoga, nested mutations, Access,
  cancellation, callback attribution, application isolation, bounded scheduling,
  rollback, output restriction, and PostgreSQL projection tests pass through one
  Core virtual-result implementation.
- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
  `yarn lint`, `yarn format:check`, and `yarn build` pass. The complete evidence
  includes 466 test files with 2,230 tests, 541 coverage files with 2,475 tests,
  26 packed-package files with 150 tests, and 78 E2E files with 313 tests.
- Coverage finishes at 88.71% statements, 81.46% branches, 94.59% functions,
  and 89.26% lines. Every package passes `attw` and `publint`.

## Out of scope

- Virtual dependencies, relationship traversal, filter/order pushdown, database
  generated values, cross-request caching, public batching, resolver side-effect
  semantics, SDKs, OpenAPI, realtime, or administration.
