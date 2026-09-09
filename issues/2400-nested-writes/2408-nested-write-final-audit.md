# 2408: Audit and close nested writes

- Status: completed
- Milestone: 24
- Packages: all first-release packages
- Depends on: 2407
- ADR: all accepted nested-write, Runtime, policy, transport, and persistence ADRs

## Goal

Close the pre-release nested-write milestone with complete repository evidence
and reconcile public documentation, generated contracts, and backlog truth.

## Acceptance criteria

- [x] Direct TypeScript, JavaScript, REST, GraphQL, Yoga, source, built, and
      packed-package execution all use one canonical nested mutation graph.
- [x] Pointer and relation inputs expose only the accepted commands and exact
      schema-dependent target IDs, create data, update data, and result types.
- [x] Access, ACL, Validation, Hooks, protected constraints, persistence
      rewrites, transactions, cancellation, events, authority, provenance, and
      output restrictions have no nested-write bypass or alternate lifecycle.
- [x] Atomicity holds across every supported command, recursive level, inverse
      mapping, late failure, projection, and concurrent application or worker.
- [x] REST and GraphQL contain only their wire contracts; Core contains no
      transport vocabulary and PostgreSQL contains no public nested input API.
- [x] Removal audits find no superseded Pointer/model connect overload, tagged
      pointer mutation input, compatibility alias, duplicate execution path,
      deep import, `any`, mutable registry, or generated Runtime dependency.
- [x] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      release scope, generated declarations, and package manifests describe
      shipped nested writes and their explicit deferred operations accurately.
- [x] The active plan is archived and milestone 24 is marked completed only
      after every issue and validation gate passes.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [x] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      browser Fetch, networkless GraphQL, Yoga, cross-transport, performance,
      multi-application, and PostgreSQL Testcontainers E2E suites.

## Out of scope

- Nested target delete/upsert, nested collection roots, partial success,
  provisional references, cyclic create graphs, arbitrary unique-filter
  connect, SDKs, OpenAPI, realtime, or administration.

## Completion evidence

- Public source, generated declarations, built declarations, package archives,
  and the PostgreSQL vertical expose one schema-dependent nested-write contract.
- Removal searches found no Pointer/model relation-handle overload, tagged
  pointer mutation alias, deep package import, generated Runtime dependency,
  PostgreSQL nested-input API, transport vocabulary in Core's nested-write
  implementation, or `any` type.
- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
  `yarn lint`, `yarn format:check`, and `yarn build` passed. Lint reported only
  80 centralized historical file-size warnings.
- The ordinary suite passed 448 files and 2,151 tests. Coverage passed 520 files
  and 2,383 tests at 88.6% statements, 81.46% branches, 94.33% functions, and
  89.15% lines.
- Packed-package validation passed 25 files and 145 tests, performance passed
  two files and three budgets, and the built browser/PostgreSQL E2E suite passed
  75 files and 300 tests.
- Verification ran on Node.js 24.20.0, Yarn 4.9.2, Darwin 24.6.0 x86_64, and
  Docker Desktop 29.7.2 using the `desktop-linux` context.
