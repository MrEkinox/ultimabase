# 2511: Audit and close contextual virtual fields

- Status: planned
- Milestone: 25
- Packages: all first-release packages
- Depends on: 2510
- ADR: proposed ADR-0244

## Goal

Close the contextual-field and virtual-result milestone with complete repository
evidence and reconciled public, generated, Runtime, persistence, and transport
contracts.

## Acceptance criteria

- [ ] Stored, embedded, virtual, and output builders expose only their accepted
      built-in and plugin capabilities through source, generated, built, and
      packed declarations.
- [ ] Invalid untyped, stale, plugin-patched, or cross-context declarations fail
      before setup or infrastructure effects and are never silently ignored.
- [ ] Virtual values use one Core declaration, dependency expansion, resolver,
      output validation, Access, cancellation, and error path across direct,
      REST, GraphQL, Yoga, read, mutation, and nested-write results.
- [ ] PostgreSQL and migration artifacts contain no virtual storage while private
      dependency selections are minimal, deduplicated, and never exposed.
- [ ] Async collection execution is bounded and deterministic; mutation failures
      roll back; contexts, Master provenance, callback attribution, application
      isolation, and final output restrictions remain exact.
- [ ] Removal audits find no permissive embedded aliases, stored-field output
      descriptors, field `resolveOutput`, generated Runtime resolver, virtual
      input/filter/order path, transport resolver, database computation, deep
      import, `any`, mutable global registry, or file-budget regression.
- [ ] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      generated declarations, package exports, and release scope describe the
      shipped contract and explicit v1 exclusions accurately.
- [ ] The active plan is archived and milestone 25 is marked completed only after
      every issue and validation gate passes.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [ ] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      browser Fetch, networkless GraphQL, Yoga, cross-transport, performance,
      concurrency, multi-application, and PostgreSQL Testcontainers E2E suites.

## Out of scope

- Virtual dependencies, relationship traversal, filter/order pushdown, database
  generated values, cross-request caching, public batching, resolver side-effect
  semantics, SDKs, OpenAPI, realtime, or administration.
