# 617: Verify and audit GraphQL cross-transport parity

- Status: completed
- Milestone: 6
- Packages: all first-release packages
- Depends on: 615, 616, 2316
- ADR: all accepted GraphQL, kernel, HTTP, Runtime, policy, and persistence ADRs

## Goal

Close the milestone with a complete networkless and Yoga GraphQL vertical,
prove semantic parity with direct TypeScript and authenticated REST execution,
and reconcile repository truth.

## Acceptance criteria

- [x] The public minimal example starts Hono on port `1337`, mounts REST and
      GraphQL as siblings through one HTTP application, and documents the exact
      application-ID, session, and optional audited Master request flow.
- [x] Direct TypeScript, REST, networkless GraphQL, and Yoga GraphQL produce
      equivalent logical behavior where their wire contracts overlap; REST
      offset envelopes and GraphQL Relay connections remain intentionally
      transport-owned representations.
- [x] Reads, CRUD, count, exists, itemized bulk, upsert, selection, inclusion,
      pointers, relations, embedded objects, ordering, GraphQL cursors,
      transactions, Hooks, Validation, Access, roles, ACL, and plugin-defined
      fields pass through one canonical Runtime pipeline.
- [x] GraphQL Core remains network-independent and imports neither HTTP nor
      REST; Yoga depends on the provider-neutral GraphQL HTTP contract and the
      shared HTTP plugin.
- [x] Password Auth sign-up, login, refresh, logout, Bearer and configured cookie
      sessions, invalid credentials, anonymous fallback, and secret redaction
      behave correctly through explicit GraphQL operation bindings without
      either transport importing the authentication plugin.
- [x] Anonymous, session-valued anonymous, and owning audited Master contexts
      preserve exact application provenance; foreign, forged, stale, invalid,
      or disabled authority attempts fail before protected GraphQL work.
- [x] Public schema and operation exposure defaults never publish plugin-owned
      credential, session, maintenance, or unrelated application storage.
- [x] Multiple test applications and workers remain isolated.
- [x] User code imports only public package exports.
- [x] Applications can omit GraphQL, Yoga, explorers, HTTP, REST, Password Auth,
      Access, Hooks, Validation, ACL, and PostgreSQL independently wherever the
      explicit capability requirements permit.
- [x] Public README, architecture, package docs, examples, roadmap, ADR links,
      issue statuses, generated declarations, and package manifests distinguish
      shipped GraphQL behavior from deferred subscriptions, federation, uploads,
      OpenAPI, SDK, realtime, and administration work.
- [x] The final audit finds no Core GraphQL product vocabulary, generic service
      lookup, legacy registry, deep import, `any`, hidden auto-exposure,
      transport authority bypass, policy-specific GraphQL branch, or stale
      pre-kernel contract.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [x] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      networkless GraphQL, browser Fetch, Yoga HTTP, cross-transport, performance,
      multi-application, and PostgreSQL Testcontainers E2E suites.

## Out of scope

- Subscriptions, live queries, federation, uploads, persisted queries,
  `@defer`, `@stream`, client generation, OpenAPI, realtime, and administration.

## Completion evidence

- The public `examples/minimal` application now mounts authenticated REST and
  GraphQL siblings on one Hono application and documents direct, Bearer, cookie,
  and audited Master flows.
- `graphql-cross-transport-parity.postgres.e2e.test.ts` proves the same Hooked
  writes and reads through direct TypeScript, REST, networkless GraphQL, and
  Yoga, then covers explicit Password Auth operations, session propagation,
  authority provenance, private-schema exposure, and safe pre-dispatch errors.
- ADR-0242 removes optional transport and worker source names from Core. Core
  retains only `requestSources.internal`; producers own inert diagnostic source
  literals that never grant authority or capability.
- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
  `yarn lint`, `yarn format:check`, and `yarn build` pass. Lint reports only the
  existing centralized file-size warnings.
- `yarn test:e2e:built` passes 280 tests in 70 files, and
  `yarn test:pack:built` passes 144 tests in 25 files.
- The minimal example's generated declarations and workspace typecheck pass.
  `yarn test:coverage` passes 2,346 tests in 511 files with 88.54% statements,
  81.18% branches, 94.16% functions, and 89.04% lines.
