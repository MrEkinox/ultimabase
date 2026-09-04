# 2316: Audit and close the HTTP and REST milestone

- Status: planned
- Milestone: 23
- Packages: repository-wide verification
- Depends on: 2315
- ADR: ADR-0224, ADR-0225, ADR-0226 and the issue 2302 REST and 2318 Password Auth contracts

## Goal

Verify the complete optional HTTP, Hono, REST, and Password Auth product
vertical, reconcile public documentation and backlog truth, and establish the
independent GraphQL resume point.

## Acceptance criteria

- [ ] Public dependency manifests and source imports match the accepted package
      graph and Core contains no HTTP, Hono, REST, GraphQL, User, password, or
      session implementation.
- [ ] Applications with no new plugin retain the measured no-transport Runtime
      path and allocate no HTTP, REST, server, or authentication placeholders.
- [ ] HTTP without Hono, Hono without REST, REST without Password Auth, Password
      Auth without HTTP or REST, and independent alternative context resolvers
      work or fail only where an explicit capability is required.
- [ ] App ID, Master, session, Access, ACL, validation, hooks, transactions,
      plugin operations, errors, and secret redaction match accepted contracts
      across source and packed consumers.
- [ ] Schema reads and mutations, plugin operations, early HTTP errors, browser
      policy, request limits, cancellation, cache variation, and generated route
      exposure have one complete implementation owner and no untested gap.
- [ ] Credential and session persistence is unreachable through ordinary
      application Query, generated routes, Typegen, and unrelated plugin
      operations; its approved internal execution never leaks authority.
- [ ] Public README, architecture, package docs, examples, roadmap, ADR links,
      issue statuses, and generated declarations distinguish shipped behavior
      from GraphQL and deferred ecosystem work.
- [ ] The completed plan records exact verification counts, environment facts,
      known limitations, and the next ready GraphQL issue.
- [ ] No temporary compatibility alias, generic auth engine, Parse clone claim,
      transport bypass, deep import, `any`, or speculative extension point
      remains.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [ ] Run package archive, coverage, performance, browser-facing, and complete
      PostgreSQL Testcontainers E2E verification.

## Out of scope

- Implementing GraphQL, HTTP Basic, Better Auth, OpenAPI, SDKs, migrations,
  uploads, realtime, or another product capability during the audit.
