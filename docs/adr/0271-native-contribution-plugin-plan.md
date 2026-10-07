# ADR-0271: Native contribution-first plugin plan

- Status: accepted
- Date: 2026-09-25
- Refines: ADR-0270
- Approval: user authorized the native internal alignment on 2026-09-25

## Context

ADR-0270 made `plugin()` and one ordered contributions list the sole public
authoring form. Its migration strategy deliberately compiled that form into the
pre-existing private `capabilities`, `operations`, `declare`, `setup`, and
`hooks` definition buckets. With every consumer migrated, that adapter is now
the only remaining user of the old definition compiler.

The bridge validates top-level metadata twice, compiles operation contributions
twice, validates derived capabilities and permission requests more than once,
and converts one application resource into synthetic setup and lifecycle hooks.
The lifecycle manager then stores the exported value while the bridge keeps the
resource in a separate `WeakMap` so later phases can recover it. Those steps add
internal code and preserve obsolete vocabulary without adding a product
capability.

## Decision

The contribution-first form becomes Core's native plugin definition model.
`plugin()` validates public options once, compiles each nominal contribution
once, normalizes one manifest, and creates one private immutable execution plan.
The plan contains pure declaration work, already compiled operation
definitions, and at most one application-resource factory. It does not contain
public or private phase-bucket authoring options.

The lifecycle manager materializes, validates, stores, and invokes the exact
application resource returned by `contributeApplication()`. Public exports and
its lifecycle callbacks therefore share one application-local object without a
synthetic setup callback, synthetic hook table, or compiler-owned resource map.
Missing resources still expose `undefined`; startup, reverse stop/disposal,
failure cleanup, application ownership, and setup-registry closure retain their
current order.

Capability providers and requirements, operation and schema-mutation
contributions, declaration requirements, permission reasons, environmental
claims, dependencies, peers, conflicts, Typegen, and transport behavior retain
their existing public contracts. Derived capability providers and permission
requirements are produced and validated once before effects. Nominal factories
and provenance checks remain mandatory.

## Developer experience

No second public factory or compatibility form is introduced. Diagnostics name
the contribution path written by the author rather than removed internal
buckets. A resource with no public exports may omit `exports`; Core normalizes
that omission to `undefined`. The configured plugin result keeps exact identity,
relationship, capability, permission, and export inference while its named type
must avoid duplicating the obsolete compiled-definition generic vocabulary.

## Preserved boundaries

Static callbacks remain pure and synchronous. Application callbacks never run
during manifest inspection, graph construction, Typegen, or declaration
compilation. Privileges are checked before plugin effects. Capability
cardinality, compatibility, ordering, ownership, materialization, and cleanup
remain unchanged. Core retains no dependency on Plugin Kit or any concrete
plugin.

## Removal

The old `compilePluginDefinition()` options compiler, private setup/hooks
adapter, operation-capability merge pass, lifecycle resource `WeakMap`, and
tests that exist only for that bridge are deleted. Historical ADRs remain
unchanged.
