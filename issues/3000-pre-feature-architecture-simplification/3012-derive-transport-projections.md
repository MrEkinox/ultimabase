# 3012: Derive REST and GraphQL transport projections

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`, command-owning plugins
- Depends on: 3011
- ADR: decision from issue 3003 refining ADR-0240

## Goal

Derive static REST and GraphQL metadata and late executable allowlists from one
canonical command record so planning and execution cannot drift.

## Acceptance criteria

- [ ] Core exposes an inert transport projection containing only the protocol's
      required identity, schema, command, authority, error, input, output, and
      owner facts.
- [ ] Late execution resolves the exact same canonical command identity and
      private codec or handler reference; no separately contributed execution
      binding can be absent, duplicated, stale, or foreign.
- [ ] REST retains current short Password Auth paths, generated schema-mutation
      paths, codecs, limits, safe errors, response envelopes, and authorization
      neutrality.
- [ ] GraphQL retains current operation fields, schema-derived signup inputs,
      schema mutations, generated types, custom schema composition, execution,
      and authorization neutrality.
- [ ] Master-only commands remain absent from public transports and transport
      metadata cannot grant authority or reveal executable callbacks.
- [ ] Superseded operation and schema-mutation transport planners, binding
      registries, comparison code, and unused-binding failure modes are removed.

## Tests

- [ ] REST, networkless GraphQL, Yoga, Password Auth, Soft Delete, public errors,
      codecs, JavaScript, packed packages, cross-transport parity, browser, and
      PostgreSQL E2E pass.
- [ ] Ownership, duplicate, unknown protocol, malformed metadata, private
      callback, and Master exclusion regressions pass.

## Audit gate

- [ ] Audit each public route and GraphQL field back to one canonical command,
      then run a source-removal audit for every old planner and binding path.
      Correct and repeat both audits until green.
- [ ] Record route/schema parity, startup, line, file, test, duration, and
      Documentation impact evidence before completion.

## Out of scope

- Adding a transport, route alias, operation, schema mutation, or authorization
  rule.
