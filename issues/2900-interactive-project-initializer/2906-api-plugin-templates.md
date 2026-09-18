# 2906: Compose HTTP, API, and explorer plugins

- Status: completed
- Milestone: 29
- Packages: `@ultimabase/create-app`, official HTTP and GraphQL plugins
- Depends on: 2905
- ADR: decision from issue 2901, ADR-0225, ADR-0238

## Goal

Complete the official-plugin selector with HTTP, Hono, REST, GraphQL, Yoga,
GraphiQL, and Apollo Sandbox while preserving each package's boundary.

## Acceptance criteria

- [x] The REST/GraphQL multi-select and complete plugin selector resolve to one
      graph. REST adds HTTP and a runnable Hono server; GraphQL over HTTP adds
      GraphQL, Yoga, HTTP, and Hono. A direct GraphQL selection may remain
      network-independent when no HTTP API was requested.
- [x] Advanced selection of HTTP, Hono, Yoga, and both explorers adds required
      compatible plugins visibly, or reports a precise incompatibility before
      project creation. No package is imported through `src/`.
- [x] Generated HTTP applications declare one exact application ID, use the
      shipped REST/GraphQL paths and request headers, and bind to loopback by
      default. Unverified public protection is never described as secure.
- [x] GraphiQL and Apollo Sandbox are development-only by default; schema
      introspection is enabled only where the selected explorer requires it.
- [x] Explicitly selected Password Auth operations are exposed only through
      the existing transport allowlists and never make CRUD authorization
      implicit.
- [x] Final output prints working next steps and sample requests for the
      selected transports without claiming an unconfigured feature works.

## Tests

- [x] Generated-project tests cover REST-only, GraphQL-only, both, direct GraphQL,
      each explorer, advanced infrastructure choices, application-ID failures,
      local binding, and authenticated versus denied requests in TS and JS.
- [x] Review HTTP, REST, GraphQL, Hono, authentication, and Quick Start pages in
      the same issue while retaining the unpublished-command warning.

## Out of scope

- New transport routes, CORS defaults, public deployment, or API tooling that
  is not already an official plugin.

## Handoff

- Documentation impact: public website documentation. Quick Start now reflects
  the implemented API selections and shows proposed npm, yarn, and pnpm entry
  points while retaining the unpublished-command warning. The existing HTTP,
  REST, GraphQL, Hono, and authentication guides remain accurate because their
  package contracts did not change.
- Validation: 7 PostgreSQL generated-project E2E tests, 43 initializer tests,
  repository typecheck and 2,400 unit tests, lint (baseline warnings only),
  build, constraints, issue checks, website content validation, and website
  production build passed. The generated-project tests use built public package
  exports; packed executable and cross-manager installation are the explicit
  subject of issue 2907.
- Scope: no implementation beyond the acceptance criteria. The user clarified
  that yarn and pnpm must be supported alongside npm; their launch commands are
  documented provisionally and will be verified from the packed package in
  issue 2907.
