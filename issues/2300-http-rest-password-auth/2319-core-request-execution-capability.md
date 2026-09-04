# 2319: Implement the Core application request execution capability

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/testing`
- Depends on: 2301
- ADR: ADR-0190, ADR-0193, ADR-0199, ADR-0206, ADR-0225

## Goal

Give transports one narrow, owner-attributed, application-bound way to enter
the existing Runtime after engine construction without exposing the framework
engine or adding transport concepts to Core.

## Acceptance criteria

- [ ] Core defines and provides one versioned `single`, application-lifetime
      request execution capability with a stable facade and private late binding.
- [ ] The facade binds after `FrameworkEngine` construction and before
      `startRuntime` or `startTransports`; calls before binding, during failed
      startup, after stop, after disposal, or from another application fail
      without an effect.
- [ ] The facade creates and binds anonymous request contexts, enters their
      request-engine scope, and retains exact result and context types without
      exposing `FrameworkEngine`, `RequestEngine`, `FrameworkApplication`, or
      `UltimaBase`.
- [ ] One owner-attributed method verifies a raw Master key, audits through the
      selected application's authority, and returns only the derived context;
      no authority or grant escapes.
- [ ] `authority:elevate` is checked for the exact active callback owner before
      verification, audit, context creation, Runtime, or another effect.
- [ ] The facade constructs explicit plugin-operation transport exposures
      without exposing the engine that owns them.
- [ ] Core exposes one shared unverified-public-transport diagnostic facade for
      generated schema routes and plugin operations, preserving ADR-0209.
- [ ] Capability and route owners can re-enter their asynchronous callbacks
      through the existing application callback executor with exact instance
      attribution.
- [ ] Core imports no HTTP, Hono, REST, GraphQL, authentication, or adapter
      implementation and allocates no executor facade for applications with no
      consumer.
- [ ] Public APIs include precise generics, English JSDoc, no `any`, and no
      generic registry or service lookup.

## Tests

- [ ] Lifecycle, late-binding, callback-owner, denied-privilege, audit,
      application-isolation, cancellation, disposal, and zero-consumer tests.
- [ ] Anonymous, plugin-valued anonymous, owning Master, foreign Master, forged
      Master, missing-authority, and audit-failure matrices.
- [ ] Source, built, packed-package, JavaScript, Typegen-free, and language-service
      public-export tests.

## Out of scope

- Implementing HTTP, routes, servers, authentication, or protocol codecs.
- Exposing engines, adapters, pipelines, transactions, authorities, grants, or
  lifecycle mutation to plugins.
