# 617: Verify and audit GraphQL cross-transport parity

- Status: planned
- Milestone: 6
- Packages: all first-release packages
- Depends on: 615, 616, 2316
- ADR: all accepted GraphQL, kernel, HTTP, Runtime, policy, and persistence ADRs

## Goal

Close the milestone with a complete networkless and Yoga GraphQL vertical,
prove semantic parity with direct TypeScript and authenticated REST execution,
and reconcile repository truth.

## Acceptance criteria

- [ ] The public minimal example starts Hono on port `1337`, mounts REST and
      GraphQL as siblings through one HTTP application, and documents the exact
      application-ID, session, and optional audited Master request flow.
- [ ] Direct TypeScript, REST, networkless GraphQL, and Yoga GraphQL produce
      equivalent logical behavior where their wire contracts overlap; REST
      offset envelopes and GraphQL Relay connections remain intentionally
      transport-owned representations.
- [ ] Reads, CRUD, count, exists, itemized bulk, upsert, selection, inclusion,
      pointers, relations, embedded objects, ordering, GraphQL cursors,
      transactions, Hooks, Validation, Access, roles, ACL, and plugin-defined
      fields pass through one canonical Runtime pipeline.
- [ ] GraphQL depends on the shared HTTP contract and never imports REST.
- [ ] Password Auth sign-up, login, refresh, logout, Bearer and configured cookie
      sessions, invalid credentials, anonymous fallback, and secret redaction
      behave correctly through explicit GraphQL operation bindings without
      either transport importing the authentication plugin.
- [ ] Anonymous, session-valued anonymous, and owning audited Master contexts
      preserve exact application provenance; foreign, forged, stale, invalid,
      or disabled authority attempts fail before protected GraphQL work.
- [ ] Public schema and operation exposure defaults never publish plugin-owned
      credential, session, maintenance, or unrelated application storage.
- [ ] Multiple test applications and workers remain isolated.
- [ ] User code imports only public package exports.
- [ ] Applications can omit GraphQL, Yoga, explorers, HTTP, REST, Password Auth,
      Access, Hooks, Validation, ACL, and PostgreSQL independently wherever the
      explicit capability requirements permit.
- [ ] Public README, architecture, package docs, examples, roadmap, ADR links,
      issue statuses, generated declarations, and package manifests distinguish
      shipped GraphQL behavior from deferred subscriptions, federation, uploads,
      OpenAPI, SDK, realtime, and administration work.
- [ ] The final audit finds no Core GraphQL product vocabulary, generic service
      lookup, legacy registry, deep import, `any`, hidden auto-exposure,
      transport authority bypass, policy-specific GraphQL branch, or stale
      pre-kernel contract.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [ ] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      networkless GraphQL, browser Fetch, Yoga HTTP, cross-transport, performance,
      multi-application, and PostgreSQL Testcontainers E2E suites.

## Out of scope

- Subscriptions, live queries, federation, uploads, persisted queries,
  `@defer`, `@stream`, client generation, OpenAPI, realtime, and administration.
