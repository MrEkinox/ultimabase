# 3007: Simplify HTTP and server application ownership

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, REST and GraphQL HTTP integrations
- Depends on: 3006
- ADR: decision from issue 3002

## Goal

Apply the single-active-application contract to HTTP selection, server
ownership, credentials, browser policy, routes, and transport lifecycle.

## Acceptance criteria

- [ ] One HTTP and server provider graph belongs to the process's active
      UltimaBase application and cannot mount a second concurrent application.
- [ ] Application ID retains only the identity or protocol responsibility
      accepted by issue 3002; obsolete same-server application selection is
      removed from request routing, errors, headers, options, and documentation.
- [ ] Raw Master verification, session resolution, request context, browser
      policy, preflight, route collision checks, and safe pre-dispatch failures
      remain application-owned and non-forgeable.
- [ ] REST, GraphQL Yoga, GraphiQL, Apollo Sandbox, and Password Auth continue to
      compose through the retained HTTP boundary without importing siblings.
- [ ] Listener start, stop, failure cleanup, restart policy, and user-supplied
      Hono integration retain exact ownership and disposal behavior.
- [ ] Shared-server multi-application code and tests are deleted with no
      compatibility router or dormant application map.

## Tests

- [ ] HTTP, Hono, REST, Yoga, explorers, sessions, Master, CORS, listener,
      JavaScript, packed package, and PostgreSQL public verticals pass.
- [ ] Relevant typecheck, lint, build, constraints, browser, and network E2E pass.

## Audit gate

- [ ] Audit every public HTTP route and credential boundary plus all removed
      application-selection symbols. Correct findings and repeat until the
      single-owner request path is complete and green.
- [ ] Record behavior, performance, line, file, test, and Documentation impact
      evidence before completion.

## Out of scope

- Changing REST or GraphQL resource semantics and command transport metadata.
