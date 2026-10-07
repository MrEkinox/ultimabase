# ADR-0045: Static typed plugin definitions

- Status: partially superseded by ADR-0267
- Date: 2026-07-31
- Refines: ADR-0003

## Decision

`definePlugin(options)` creates one immutable static plugin definition. It
validates and preserves a non-empty literal name, optional version, required
and optional dependency names, conflicts, nested plugin definitions, one setup
callback, and lifecycle hooks. Declaration never invokes setup or hooks.

Setup receives the application-owned schema and service registries currently
available in Core. Its synchronous or asynchronous return value is the plugin's
typed runtime export. `PluginExports<TPlugin>` unwraps that value for future
plugin lookup without initializing the definition.

Lifecycle hooks use the fixed `connect`, `prepareSchema`, `startRuntime`,
`startTransports`, `stop`, and `dispose` phases. Their context contains the
setup registries and the exact resolved setup export. The lifecycle manager
introduced later owns execution order and failure cleanup.

Arrays and hook records are copied and frozen. Nested definitions retain their
immutable identity and must themselves come from `definePlugin`. Dependency
resolution, nested flattening, duplicate detection, conflicts, and cycles stay
outside this declaration boundary.

## Consequences

Plugin factories remain ordinary functions returning reusable definitions.
Configuration is inspectable before infrastructure starts, while literal names
and setup exports remain available to the future typed plugin registry.

Adding setup registries or lifecycle phases changes a public plugin-authoring
contract and therefore requires an explicit follow-up decision. Static
definitions remain separate from initialized runtime plugin instances.
