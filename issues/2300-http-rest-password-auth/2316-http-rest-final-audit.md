# 2316: Audit and close the HTTP and REST milestone

- Status: completed
- Milestone: 23
- Packages: repository-wide verification
- Depends on: 2315
- ADR: ADR-0224, ADR-0225, ADR-0226, ADR-0228, ADR-0234, ADR-0235

## Goal

Verify the complete optional HTTP, Hono, REST, and Password Auth product
vertical, reconcile public documentation and backlog truth, and establish the
independent GraphQL resume point.

## Acceptance criteria

- [x] Public dependency manifests and source imports match the accepted package
      graph and Core contains no HTTP, Hono, REST, GraphQL, User, password, or
      session implementation.
- [x] Applications with no new plugin retain the measured no-transport Runtime
      path and allocate no HTTP, REST, server, or authentication placeholders.
- [x] HTTP without Hono, Hono without REST, REST without Password Auth, Password
      Auth without HTTP or REST, and independent alternative context resolvers
      work or fail only where an explicit capability is required.
- [x] App ID, Master, session, Access, ACL, validation, hooks, transactions,
      plugin operations, errors, and secret redaction match accepted contracts
      across source and packed consumers.
- [x] Schema reads and mutations, plugin operations, early HTTP errors, browser
      policy, request limits, cancellation, cache variation, and generated route
      exposure have one complete implementation owner and no untested gap.
- [x] Credential and session persistence is unreachable through ordinary
      application Query, generated routes, Typegen, and unrelated plugin
      operations; its approved internal execution never leaks authority.
- [x] Public README, architecture, package docs, examples, roadmap, ADR links,
      issue statuses, and generated declarations distinguish shipped behavior
      from GraphQL and deferred ecosystem work.
- [x] The completed plan records exact verification counts, environment facts,
      known limitations, and the next ready GraphQL issue.
- [x] No temporary compatibility alias, generic auth engine, Parse clone claim,
      transport bypass, deep import, `any`, or speculative extension point
      remains.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [x] Run package archive, coverage, performance, browser-facing, and complete
      PostgreSQL Testcontainers E2E verification.

## Out of scope

- Implementing GraphQL, HTTP Basic, Better Auth, OpenAPI, SDKs, migrations,
  uploads, realtime, or another product capability during the audit.
