# ADR-0046: Plugin normalization and exclusive slots

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0003, ADR-0045
- Partially superseded by: ADR-0190

## Decision

`normalizePlugins(definitions)` traverses top-level and nested plugin
definitions in depth-first configuration order. It produces one immutable flat
entry per definition identity without invoking setup or lifecycle hooks. Each
entry records its first configuration index, all parent names, and effective
dependencies. A nested child gains every parent as an implicit dependency
without mutating its static definition or duplicating an existing dependency.

Repeating the exact same definition object is composition reuse and is
deduplicated. Its parent relationships are merged in encounter order. Two
distinct definition objects with the same plugin name fail with
`PLUGIN_CONFLICT`; Core cannot safely compare configuration containing
callbacks or closure state to prove those definitions equivalent.

A plugin may declare one optional `slot`. Slots identify architectural roles
that accept exactly one implementation, such as `database-adapter` or
`http-server`. Distinct plugin names occupying the same slot fail with
`PLUGIN_CONFLICT`. Explicit `conflicts` remain separate metadata for named
incompatibilities, while non-exclusive capabilities may later use a different
contract.

## Consequences

Nested configuration remains concise while later dependency resolution
receives a deterministic global input. Parent setup can be ordered before
children, and mutually exclusive infrastructure implementations fail before
initialization.

Required and optional dependency existence, explicit conflicts, cycles, and
topological ordering remain responsibilities of the plugin graph resolver.
