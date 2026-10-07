# 2319: Implement the Core application request execution capability

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/testing`
- Depends on: 2301
- ADR: ADR-0190, ADR-0193, ADR-0199, ADR-0206, ADR-0225

## Goal

Give transports one narrow, owner-attributed, application-bound way to enter
the existing Runtime after engine construction without exposing the framework
engine or adding transport concepts to Core.

## Acceptance criteria

- [x] Core defines and provides one versioned `single`, application-lifetime
      request execution capability with a stable facade and private late binding.
- [x] The facade binds after `FrameworkEngine` construction and before
      `startRuntime` or `startTransports`; calls before binding, during failed
      startup, after stop, after disposal, or from another application fail
      without an effect.
- [x] The facade creates and binds anonymous request contexts, enters their
      request-engine scope, and retains exact result and context types without
      exposing `FrameworkEngine`, `RequestEngine`, `FrameworkApplication`, or
      `UltimaBase`.
- [x] One owner-attributed method verifies a raw Master key, audits through the
      selected application's authority, and returns only the derived context;
      no authority or grant escapes.
- [x] `authority:elevate` is checked for the exact active callback owner before
      verification, audit, context creation, Runtime, or another effect.
- [x] The facade constructs explicit plugin-operation transport exposures
      without exposing the engine that owns them.
- [x] Core exposes one shared unverified-public-transport diagnostic facade for
      generated schema routes and plugin operations, preserving ADR-0209.
- [x] Capability and route owners can re-enter their asynchronous callbacks
      through the existing application callback executor with exact instance
      attribution.
- [x] Core imports no HTTP, Hono, REST, GraphQL, authentication, or adapter
      implementation and allocates no executor facade for applications with no
      consumer.
- [x] Public APIs include precise generics, English JSDoc, no `any`, and no
      generic registry or service lookup.

## Tests

- [x] Lifecycle, late-binding, callback-owner, denied-privilege, audit,
      application-isolation, cancellation, disposal, and zero-consumer tests.
- [x] Anonymous, plugin-valued anonymous, owning Master, foreign Master, forged
      Master, missing-authority, and audit-failure matrices.
- [x] Source, built, packed-package, JavaScript, Typegen-free, and language-service
      public-export tests.

## Completion evidence

- `yarn typecheck` passed.
- `yarn test` — 350 files and 1,700 tests passed with no type errors.
- `yarn lint` passed with repository line-count warnings and no errors.
- `yarn build` passed for every workspace, including API and package checks.
- Focused built and packed E2E verification — 4 files and 55 tests passed.
- `yarn constraints`, `yarn format:check`, and `git diff --check` passed.

## Out of scope

- Implementing HTTP, routes, servers, authentication, or protocol codecs.
- Exposing engines, adapters, pipelines, transactions, authorities, grants, or
  lifecycle mutation to plugins.
