# 2408: Audit and close nested writes

- Status: planned
- Milestone: 24
- Packages: all first-release packages
- Depends on: 2407
- ADR: all accepted nested-write, Runtime, policy, transport, and persistence ADRs

## Goal

Close the pre-release nested-write milestone with complete repository evidence
and reconcile public documentation, generated contracts, and backlog truth.

## Acceptance criteria

- [ ] Direct TypeScript, JavaScript, REST, GraphQL, Yoga, source, built, and
      packed-package execution all use one canonical nested mutation graph.
- [ ] Pointer and relation inputs expose only the accepted commands and exact
      schema-dependent target IDs, create data, update data, and result types.
- [ ] Access, ACL, Validation, Hooks, protected constraints, persistence
      rewrites, transactions, cancellation, events, authority, provenance, and
      output restrictions have no nested-write bypass or alternate lifecycle.
- [ ] Atomicity holds across every supported command, recursive level, inverse
      mapping, late failure, projection, and concurrent application or worker.
- [ ] REST and GraphQL contain only their wire contracts; Core contains no
      transport vocabulary and PostgreSQL contains no public nested input API.
- [ ] Removal audits find no superseded Pointer/model connect overload, tagged
      pointer mutation input, compatibility alias, duplicate execution path,
      deep import, `any`, mutable registry, or generated Runtime dependency.
- [ ] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      release scope, generated declarations, and package manifests describe
      shipped nested writes and their explicit deferred operations accurately.
- [ ] The active plan is archived and milestone 24 is marked completed only
      after every issue and validation gate passes.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [ ] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      browser Fetch, networkless GraphQL, Yoga, cross-transport, performance,
      multi-application, and PostgreSQL Testcontainers E2E suites.

## Out of scope

- Nested target delete/upsert, nested collection roots, partial success,
  provisional references, cyclic create graphs, arbitrary unique-filter
  connect, SDKs, OpenAPI, realtime, or administration.
