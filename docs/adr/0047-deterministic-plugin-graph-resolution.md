# ADR-0047: Deterministic plugin graph resolution

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0003, ADR-0046

## Decision

`new PluginGraph(normalizedPlugins)` validates normalized plugin metadata and
produces one immutable deterministic setup order. Required dependencies and
present optional dependencies create directed edges from providers to
consumers. Missing optional dependencies are ignored, while a missing required
dependency fails with `PLUGIN_DEPENDENCY_MISSING`.

The graph uses stable Kahn topological ordering. Among nodes that are ready at
the same time, the first normalized configuration index wins. Input position
breaks ties when independently normalized lists contain equal indexes. This
keeps composition reproducible without making plugin names affect behavior.

Explicit named conflicts and exclusive-slot collisions fail with
`PLUGIN_CONFLICT`. Slot validation is repeated by `PluginGraph` because callers
may combine multiple lists that were normalized independently. Repeated graph
entries and distinct definitions sharing a name use `PLUGIN_DUPLICATE`, which
refines the duplicate diagnostic described by ADR-0046. Dependency cycles use
`PLUGIN_DEPENDENCY_CYCLE` and include one deterministic closed cycle path in
diagnostic details.

Graph construction never invokes setup or lifecycle hooks. The resolved order
is exposed through `plugins`, iteration, and name lookup. Later lifecycle work
uses that order for startup and its reverse for teardown.

## Consequences

Configuration errors fail before infrastructure starts and retain stable error
codes for diagnostics. Optional integrations participate in ordering only when
installed, and unrelated plugins keep their author-specified order.

Graph resolution operates on normalized entries rather than raw definitions,
so nested parent dependencies have already been materialized consistently.
