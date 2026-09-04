# 2301: Decide HTTP, REST, and Password Auth boundaries

- Status: completed
- Milestone: 23
- Packages: architecture documentation
- Depends on: none
- ADR: ADR-0224

## Goal

Replace the pre-kernel transport sequencing with one accepted package and
security boundary for HTTP, REST, Hono, public application identity, audited
Master requests, local password authentication, and later independent GraphQL.

## Acceptance criteria

- [x] ADR-0224 moves the neutral HTTP host contract out of Core and into the
      optional official `@ultimabase/http-plugin` package.
- [x] Hono, REST, GraphQL Yoga, and HTTP authentication integrations depend on
      HTTP without depending on one another.
- [x] GraphQL Core remains network-independent and no GraphQL package imports
      REST.
- [x] Every public HTTP application request requires the canonical
      application-ID header, which selects one exact mounted application
      without granting authority; infrastructure-only preflight is the sole
      explicitly configured exception.
- [x] The canonical Master header is explicitly enabled, verified by only the
      selected application's Core authority, audited before elevation, and
      never retained after verification.
- [x] Transport booleans, shaped contexts, foreign grants, missing application
      IDs, invalid keys, and cross-application keys cannot create Master.
- [x] The first local authentication product is
      `@ultimabase/password-auth-plugin`, with password operations followed by
      opaque Bearer or secure-cookie sessions.
- [x] HTTP Basic and Better Auth remain independent deferred integrations and
      no unproven generic authentication package is introduced.
- [x] The active plan schedules REST before Password Auth and Password Auth
      before GraphQL while preserving package dependency direction.
- [x] Original issues remain as superseded history instead of being rewritten
      as completed implementation.

## Tests

- [x] `yarn check:issues` validates the new milestone and dependency graph.
- [x] `yarn format:check` validates the planning and ADR files.

## Completion evidence

- `yarn check:issues` — 1 file and 9 tests passed.
- Focused active-documentation and backlog verification — 2 files and 14 tests
  passed.
- `yarn format:check` and `git diff --check` passed.

## Out of scope

- Implementing a package, route, server, credential store, or Runtime behavior.
- Selecting the concrete REST v1 wire contract owned by issue 2302.
- Activating GraphQL, HTTP Basic, Better Auth, SDK, OpenAPI, or browser tooling.
