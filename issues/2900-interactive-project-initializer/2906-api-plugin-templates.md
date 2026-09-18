# 2906: Compose HTTP, API, and explorer plugins

- Status: planned
- Milestone: 29
- Packages: `@ultimabase/create-app`, official HTTP and GraphQL plugins
- Depends on: 2905
- ADR: decision from issue 2901, ADR-0225, ADR-0238

## Goal

Complete the official-plugin selector with HTTP, Hono, REST, GraphQL, Yoga,
GraphiQL, and Apollo Sandbox while preserving each package's boundary.

## Acceptance criteria

- [ ] The REST/GraphQL multi-select and complete plugin selector resolve to one
      graph. REST adds HTTP and a runnable Hono server; GraphQL over HTTP adds
      GraphQL, Yoga, HTTP, and Hono. A direct GraphQL selection may remain
      network-independent when no HTTP API was requested.
- [ ] Advanced selection of HTTP, Hono, Yoga, and both explorers adds required
      compatible plugins visibly, or reports a precise incompatibility before
      project creation. No package is imported through `src/`.
- [ ] Generated HTTP applications declare one exact application ID, use the
      shipped REST/GraphQL paths and request headers, and bind to loopback by
      default. Unverified public protection is never described as secure.
- [ ] GraphiQL and Apollo Sandbox are development-only by default; schema
      introspection is enabled only where the selected explorer requires it.
- [ ] Explicitly selected Password Auth operations are exposed only through
      the existing transport allowlists and never make CRUD authorization
      implicit.
- [ ] Final output prints working next steps and sample requests for the
      selected transports without claiming an unconfigured feature works.

## Tests

- [ ] Packed-project tests cover REST-only, GraphQL-only, both, direct GraphQL,
      each explorer, advanced infrastructure choices, application-ID failures,
      local binding, and authenticated versus denied requests in TS and JS.
- [ ] Review HTTP, REST, GraphQL, Hono, authentication, and Quick Start pages in
      the same issue while retaining the unpublished-command warning.

## Out of scope

- New transport routes, CORS defaults, public deployment, or API tooling that
  is not already an official plugin.
