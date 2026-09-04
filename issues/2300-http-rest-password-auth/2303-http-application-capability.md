# 2303: Implement the HTTP application capability

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: 2319
- ADR: ADR-0224, ADR-0225

## Goal

Create the optional official HTTP plugin and its versioned Fetch-compatible
application capability without adding HTTP product behavior to Core.

## Acceptance criteria

- [ ] Create a complete publishable `packages/http-plugin` workspace exporting
      `httpPlugin()`; no empty placeholder or Core deep import is introduced.
- [ ] The plugin owns one non-empty public `appId` and requires the canonical
      application-ID header on every public application request; the browser
      preflight exception remains owned by issue 2317.
- [ ] Application-lifetime capabilities compose owned route and mount
      declarations with deterministic plugin and registration order.
- [ ] HTTP consumes only ADR-0225's narrow application request executor and
      never receives a framework engine, application object, adapter, pipeline,
      authority, or grant.
- [ ] Duplicate route identities, duplicate application IDs on one provider,
      incompatible providers, and unsupported protocol versions reject the
      conflicting application before route registration or listener mutation;
      already mounted applications remain unchanged.
- [ ] The provider-facing request boundary preserves the header-cardinality
      evidence required by the accepted HTTP contract; selected route handlers
      use standard `Request` and `Response` values.
- [ ] HTTP remains independent from Hono, REST, GraphQL, authentication, and
      databases.
- [ ] Existing and framework-created HTTP server providers can materialize the
      same exact application-local route graph.
- [ ] Route provenance retains the contributing plugin and instance identity.
- [ ] Every resolver, route, codec, and mount callback re-enters through Core's
      callback executor under its exact contributing plugin and instance.
- [ ] Zero HTTP plugin installation creates no capability, route registry,
      listener, request context, or transport diagnostic.
- [ ] Public contracts contain English JSDoc, exact generic inference, no
      `any`, and focused source and packed autocomplete coverage.

## Tests

- [ ] Runtime, type, lifecycle, capability, conflict, replacement, application
      isolation, and fake-server conformance tests.
- [ ] Public source, built, JavaScript, Typegen-free, and packed-package tests.

## Out of scope

- Opening a network socket or importing a server framework.
- Parsing REST or GraphQL.
- Master verification, sessions, CORS, rate limiting, compression, or TLS
  termination.
