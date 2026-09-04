# 2311: Verify the anonymous and Master REST vertical

- Status: planned
- Milestone: 23
- Packages: all HTTP and REST vertical packages
- Depends on: 2305, 2306, 2307, 2308, 2309, 2310, 2317, 2319, 2320
- ADR: ADR-0224, ADR-0225, ADR-0226 and the issue 2302 REST contract

## Goal

Prove one real client-to-PostgreSQL REST vertical for anonymous and audited
Master requests before authentication or GraphQL work begins.

## Acceptance criteria

- [ ] A public example starts Hono on port `1337`, requires an application ID,
      and exposes configured REST schema and plugin-operation routes.
- [ ] Anonymous CRUD, find, get, count, upsert, itemized bulk, cursors,
      selections, inclusions, pointers, relations, Access, ACL, Hooks, and
      Validation match direct Runtime behavior.
- [ ] The accepted `first` and `exists` behavior is implemented or rejected
      exactly as documented by the REST contract.
- [ ] A browser-style Fetch client can inject a test application ID and Master
      key and receives audited Master authority for the exact application.
- [ ] Missing and wrong application IDs, invalid and foreign Master keys,
      forged authority shapes, audit failures, disabled Master transport, and
      secret leakage all fail before protected work.
- [ ] An explicitly exposed plugin operation runs with anonymous and owning
      Master contexts while foreign or forged Master contexts fail before its
      codec or handler.
- [ ] Plugin-owned credential, session, and maintenance schemas have no route
      unless the accepted explicit exposure contract selects them.
- [ ] Multiple applications on one server, multiple servers, and parallel test
      workers retain isolated routes, contexts, authorities, databases, and
      lifecycle cleanup.
- [ ] An application can omit HTTP, Hono, REST, Access, Hooks, Validation, ACL,
      and authentication independently where their contracts permit.
- [ ] Public documentation distinguishes current working APIs from Password
      Auth, GraphQL, SDK, and later roadmap targets.

## Tests

- [ ] Source, built, packed-package, JavaScript, Typegen-free, generated
      TypeScript, browser Fetch, and PostgreSQL Testcontainers E2E suites pass.
- [ ] Relevant conformance, privilege, capability, performance, and application
      isolation suites pass without a material no-transport regression.

## Out of scope

- Password authentication, GraphQL, HTTP Basic, Better Auth, OpenAPI, SDKs,
  uploads, and production deployment automation.
