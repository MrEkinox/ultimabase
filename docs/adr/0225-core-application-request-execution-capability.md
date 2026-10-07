# ADR-0225: Core provides a narrow application request execution capability

- Status: accepted
- Date: 2026-09-03
- Refines: ADR-0190, ADR-0193, ADR-0199, ADR-0206, ADR-0224
- Depends on: ADR-0186, ADR-0190, ADR-0193, ADR-0199, ADR-0206

## Context

Application capabilities materialize before `UltimaBase` creates its
`FrameworkEngine`. Their factories receive schemas, declared capability reads,
callback attribution, privilege assertions, and adapter constraint compilers,
but no application-owned request execution boundary. Setup and lifecycle hooks
also receive no Runtime engine.

That is sufficient for current database, policy, hook, and declaration plugins,
whose callbacks are entered by Core. It is insufficient for a transport plugin:
an HTTP handler must create or bind one request context, preserve its exact
plugin attribution, enter the owning Runtime, and optionally request audited
Master elevation after the engine exists.

Exposing the complete `FrameworkEngine` through every plugin context would be a
broad new public power. Requiring transports to capture an `UltimaBase` instance
from user code would instead create circular configuration and break automatic
lifecycle ownership.

Core's existing public-operation transport also accepts anonymous Core authority
only. A transport therefore cannot execute an explicitly exposed plugin
operation when the same application's already verified HTTP boundary produced a
Master context, even though no wire input manufactured that authority.

## Decision

### Core provides one late-bound execution capability

Core defines and provides one versioned, `single`, application-lifetime request
execution capability. It is a narrow facade rather than a `FrameworkEngine`,
`FrameworkApplication`, `UltimaBase`, adapter, pipeline, or authority reference.

The stable facade may materialize before Runtime construction, but Core binds its
private implementation immediately after the application engine is created and
before any `startRuntime` or `startTransports` hook runs. Calling it before that
binding, after stop or disposal, or for another application fails without an
effect.

The capability supports only the operations proven by public transports:

- create and bind an immutable anonymous request context for the exact
  application;
- run an owner-attributed callback in the corresponding request-engine scope;
- exchange one raw Master credential for an audited derived context without
  exposing the grant, authority, or engine;
- construct an explicit plugin-operation transport exposure through Core's
  existing allowlist and codec boundary;
- report or acknowledge unverified public transport protection for schema and
  operation exposure through one shared Core diagnostic contract.

The facade never exposes raw adapters, transactions, Runtime stages, application
identity objects, Master authority objects, opaque grants, privilege controls,
or mutable lifecycle state.

### Callback attribution remains exact

Capability contributions retain their plugin and optional instance owner. Every
context resolver, route handler, codec, and other contributed callback is invoked
through Core's existing application callback executor under that exact owner.
Nested callbacks replace rather than inherit a different plugin owner.

Master exchange runs inside the HTTP plugin owner's attributed callback. The
existing `authority:elevate` check therefore occurs before authorization, audit,
or downstream work. Receiving an already verified Master context in a REST,
GraphQL, authentication, or operation callback is inherited caller authority and
does not grant those plugins a new elevation power.

### Verified Master contexts may enter operation transports

The generic operation-transport request accepts any real `RequestContext`.
`FrameworkEngine.withContext()` remains the mandatory binding boundary and
rejects foreign, unbound Master, structurally forged, stale, or wrong-authority
contexts before operation decoding or execution.

This change does not let transport input select Master. Only the preceding
application-owned credential exchange can produce an acceptable Master context.
Anonymous contexts carrying plugin-owned session identity remain anonymous Core
authority as before.

### Public exposure diagnostics are shared

The existing `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` semantics apply to both
explicit plugin-operation bindings and generated schema routes. Core owns one
facade for emitting and acknowledging the diagnostic; REST, GraphQL, and future
transports do not copy policy-provider inspection or invent competing warnings.

## Consequences

- HTTP and future transports can enter the existing Runtime without Core naming
  a protocol or concrete server.
- Hono can begin accepting requests only after the executor is privately bound.
- Owner-scoped privilege enforcement survives asynchronous network callbacks.
- Schema routes and plugin operations share truthful public-protection
  diagnostics.
- Operation transports can preserve verified application-owned Master authority
  without accepting authority from wire data.

## Non-goals

- Exposing `FrameworkEngine`, `RequestEngine`, `FrameworkApplication`, or
  `UltimaBase` as a generic plugin service.
- Adding HTTP, REST, GraphQL, authentication, or server behavior to Core.
- Letting a capability provider bind, replace, or inspect the private executor.
- Creating a new authority mode or bypassing Master audit and provenance.
