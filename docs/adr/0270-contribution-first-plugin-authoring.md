# ADR-0270: Contribution-first plugin authoring

- Status: accepted
- Date: 2026-09-25
- Refines: ADR-0191, ADR-0192, ADR-0259, ADR-0269
- Approval: user authorized the complete authoring-form migration on 2026-09-25

## Context

ADR-0269 made Core the sole owner of foundational plugin authoring and removed
several duplicated registries. It still asks an author to understand and fill
Core's private phase buckets: `capabilities`, `operations`, `declare`, `setup`,
and `hooks`. The distinction protects Core internally, but exposing it at the
plugin factory makes one feature look like several unrelated registrations.

The remaining module factory also creates a two-step definition shape and a
separate public type derivation vocabulary. Official plugins demonstrate that
those abstractions do not yet make the common path visibly small.

## Decision

Core exposes one `plugin()` factory. One invocation supplies stable identity,
optional instance identity, compatibility, relationships, environmental
claims, human-readable permission reasons, and one ordered `contributions`
tuple. A plugin package normally exports a function that returns this direct
call, and derives its public configured type with ordinary `ReturnType`.

Nominal capability providers and requirements, operation and schema-mutation
contributions, static declaration contributions, and at most one application
resource contribution are accepted in the same tuple. Core partitions and
compiles them into its existing private declaration, materialization, setup,
lifecycle, operation, transport, and Typegen phases. The public flattening does
not merge those internal execution boundaries.

Core derives privilege names from contribution kinds and capability protocol
metadata. The author still supplies a non-empty reason for every derived
privilege. A callback that uses an additional privileged Core facade attaches
that use to its exact contribution. Missing reasons, unused reasons, forged
contributions, and detached powers fail before any plugin callback runs.
Conditional reasons remain tied to an explicitly declared optional capability.

Static declaration contributions expose only their relevant registrars.
Application contributions create one application-local resource whose public
exports and lifecycle callbacks remain bound to that application. Core retains
dependency order, reverse teardown, failure cleanup, and setup-only facade
closure.

## Preserved boundaries

All capability cardinality, lifetime, compatibility, ownership, materialization,
and cleanup rules remain unchanged. Operation ownership and explicit transport
selection remain unchanged. Static declarations stay synchronous and
infrastructure-free. Application callbacks never enter Typegen or inert graph
inspection. Privilege policy is still evaluated before effects and no
privilege implies another. Environmental claims remain informational and
separate.

Plugin relationships remain a flat application concern; nested plugins do not
return. Core gains no dependency on Plugin Kit or a concrete database,
transport, authentication, policy, server, or infrastructure package. The new
factory compiles into the existing private graph rather than adding a second
runtime registry.

## Migration

Milestone 34 first adds the contribution compiler and proves it with a minimal
fixture, Soft Delete, and Password Auth. It then migrates all production
plugins, repository fixtures, templates, examples, tests, and documentation.
The public `definePlugin()`, `definePluginModule()`, their phase-bucket option
types, and module-instance derivation types are removed before completion; no
compatibility alias remains.
