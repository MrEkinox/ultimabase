# ADR-0195: Setup-phase capability requirements support peer composition

- Status: accepted
- Date: 2026-08-12
- Refines: ADR-0186, ADR-0190
- Depends on: ADR-0190, ADR-0191

## Context

ADR-0190 makes versioned capabilities the only public cross-plugin integration
host. Its initial implementation treated every capability requirement as a
provider-first plugin dependency and as a prerequisite of every application
capability factory owned by the consumer.

That interpretation rejects a common valid composition: plugin A provides X and
reads Y during setup, while plugin B provides Y and reads X during setup. Both
application values may be independently materialized before either setup
callback, so this is not a resource-construction cycle. Treating it as one
forces artificial integration plugins or concrete package dependencies.

True factory cycles must still fail because neither resource can be created
first. Lifecycle-sensitive consumers must also retain deterministic
provider-first ordering by default.

## Decision

Every capability requirement declares one phase:

- `materialization` is the default and preserves ADR-0190 behavior. Compatible
  providers precede the consumer in the plugin graph, application factories may
  read the requirement, and dependent lifecycle phases retain provider-first
  order.
- `setup` validates the same nominal token, version range, optionality, and
  privilege conditions, but adds no plugin-graph dependency. Core materializes
  every application capability before any setup callback, then exposes the
  composed value through the owner-bound setup reader.

Plugin authors opt into peer composition explicitly:

```ts
const peer = optionalCapability(peerCapability, '^1.0.0', {
	phase: 'setup',
})
```

A setup-phase requirement is unavailable to application capability factories.
Attempting to read it there is a configuration error even when its provider was
materialized earlier by coincidence. This prevents configuration order from
silently changing factory behavior.

Setup-phase requirements do not promise provider-first `connect`, `stop`, or
`dispose` ordering. A plugin that needs another provider during resource
construction or lifecycle work must use the default materialization phase; a
cycle between such requirements remains an error.

Requirement phase is immutable inspection metadata. Recreated requirement
objects remain invalid because owner-bound readers accept only the exact
manifest declarations.

## Consequences

- Official and community plugins can compose mutual setup-time protocols
  without concrete dependencies or one-off coordinator plugins.
- Existing two-argument `requireCapability` and `optionalCapability` calls keep
  provider-first ordering.
- Real application factory cycles and named plugin cycles remain rejected.
- Peer protocols must deliberately avoid lifecycle-order assumptions.

## Non-goals

- Supporting cyclic application resource construction.
- Inferring requirement phase from whether a callback happens to read it.
- Allowing setup-phase requirements in static declarations before application
  capability materialization.
- Reordering the fixed application lifecycle phases.
