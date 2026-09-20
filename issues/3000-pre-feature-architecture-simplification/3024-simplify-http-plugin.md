# 3024: Simplify the HTTP plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/http-plugin`, `@ultimabase/graphql-http`
- Depends on: 3023
- ADR: decision from issue 3002 and retained HTTP decisions

## Goal

Simplify the protocol-neutral Fetch boundary after single-application ownership
is established, while preserving credential and routing safety.

## Acceptance criteria

- [ ] Baseline application identity, route and mount composition, original
      headers, credentials, sessions, Master exchange, browser policy, request
      context, timeouts, errors, lifecycle, exports, and tests.
- [ ] Remove obsolete application-selection, duplicate route planning, context,
      error, and lifecycle representations left after issues 3007 and 3012.
- [ ] Preserve exact route collision rules, original-header evidence, safe
      pre-dispatch failures, CORS and preflight semantics, request cancellation,
      session resolution, non-forgeable Master authority, and transport-neutral
      composition.
- [ ] Keep HTTP independent from Hono, REST, GraphQL, Yoga, authentication
      providers, and databases.
- [ ] Change no public behavior, configuration, export, header, path, or error
      without an architecture stop and explicit user approval.
- [ ] Review the affected HTTP pages under `apps/website/content/docs` and, when
      required, update them and the package READMEs in the same audited issue.

## Tests

- [ ] Fetch, routes, mounts, headers, credentials, sessions, Master, CORS,
      preflight, cancellation, lifecycle, source and packed, JavaScript, and
      browser suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for credential forgery, unsafe disclosure, route drift, sibling
      imports, stale application maps, duplicate contexts, and resource leaks.
      Correct and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding an HTTP framework, protocol, authentication provider, or route.
