# 2303: Implement the HTTP application capability

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/http-plugin`, `@ultimabase/core`, `@ultimabase/plugin-kit`
- Depends on: 2319
- ADR: ADR-0224, ADR-0225

## Goal

Create the optional official HTTP plugin and its versioned Fetch-compatible
application capability without adding HTTP product behavior to Core.

## Acceptance criteria

- [x] Create a complete publishable `packages/http-plugin` workspace exporting
      `httpPlugin()`; no empty placeholder or Core deep import is introduced.
- [x] The plugin owns one non-empty public `appId` and requires the canonical
      application-ID header on every public application request; the browser
      preflight exception remains owned by issue 2317.
- [x] Application-lifetime capabilities compose owned route and mount
      declarations with deterministic plugin and registration order.
- [x] HTTP consumes only ADR-0225's narrow application request executor and
      never receives a framework engine, application object, adapter, pipeline,
      authority, or grant.
- [x] Duplicate route identities, duplicate application IDs on one provider,
      incompatible providers, and unsupported protocol versions reject the
      conflicting application before route registration or listener mutation;
      already mounted applications remain unchanged.
- [x] The provider-facing request boundary preserves the header-cardinality
      evidence required by the accepted HTTP contract; selected route handlers
      use standard `Request` and `Response` values.
- [x] HTTP remains independent from Hono, REST, GraphQL, authentication, and
      databases.
- [x] Existing and framework-created HTTP server providers can materialize the
      same exact application-local route graph.
- [x] Route provenance retains the contributing plugin and instance identity.
- [x] Every resolver, route, codec, and mount callback re-enters through Core's
      callback executor under its exact contributing plugin and instance.
- [x] Zero HTTP plugin installation creates no capability, route registry,
      listener, request context, or transport diagnostic.
- [x] Public contracts contain English JSDoc, exact generic inference, no
      `any`, and focused source and packed autocomplete coverage.

## Tests

- [x] Runtime, type, lifecycle, capability, conflict, replacement, application
      isolation, and fake-server conformance tests.
- [x] Public source, built, JavaScript, Typegen-free, and packed-package tests.

## Completion evidence

- `yarn typecheck` passed.
- `yarn test` — 359 files and 1,734 tests passed with no type errors.
- `yarn lint` passed with repository line-count warnings and no errors.
- `yarn build` passed for every workspace, including API and package checks.
- `yarn test:pack:built` — 20 files and 104 packed-consumer tests passed.
- `yarn constraints`, focused formatting, issue metadata, and `git diff --check`
  passed.

## Out of scope

- Opening a network socket or importing a server framework.
- Parsing REST or GraphQL.
- Master verification, sessions, CORS, rate limiting, compression, or TLS
  termination.
