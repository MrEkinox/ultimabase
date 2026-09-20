# 3033: Reconcile the HTTP and transport website journey

- Status: planned
- Milestone: 30
- Packages: `apps/website`, HTTP, Hono Server, REST, GraphQL, GraphQL Yoga, GraphiQL, and Apollo Sandbox plugins
- Depends on: 3032
- ADR: retained transport decisions and any explicitly approved public changes from issues 3024 through 3030

## Goal

Make the public Fumadocs journey from the Fetch boundary to REST, GraphQL, and
browser explorers match the final simplified transport architecture.

## Acceptance criteria

- [ ] Audit the `http-and-transports` and `api-explorers` ownership areas plus
      every affected page-level `sources` entry.
- [ ] Update application identity, server ownership, credentials, Master,
      sessions, browser policy, REST paths and envelopes, GraphQL schemas and
      errors, Yoga, introspection, and explorer setup wherever contracts changed.
- [ ] Preserve REST and GraphQL sibling ownership and show that both enter the
      same Runtime behavior without transport-specific authorization claims.
- [ ] Verify Password Auth and Soft Delete examples across both transports and
      add migration notes for every explicitly approved public change.
- [ ] Remove stale shared-server, route, header, operation, schema, and explorer
      examples while keeping the runnable application coherent.
- [ ] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [ ] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [ ] Exercise the documented REST and GraphQL journeys and audit every claim
      against final source, packed exports, and browser behavior. Correct and
      repeat until no stale or missing step remains.
- [ ] Record reviewed pages and Documentation impact: public website
      documentation.

## Out of scope

- Adding protocols, routes, schema fields, or explorer features.
