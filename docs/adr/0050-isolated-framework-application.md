# ADR-0050: Isolated FrameworkApplication boundary

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0001, ADR-0003, ADR-0049
- Refined by: ADR-0094

## Decision

`FrameworkApplication` is the instance-owned Core facade. Construction creates a
new `SchemaRegistry`, normalized `PluginGraph`, `PluginSetupRegistries`, and
`PluginLifecycleManager` for the supplied static schemas and plugin definitions.
No registry or application singleton is stored globally.

`createApplication(options)` is the canonical asynchronous factory. It validates
schema and graph configuration, completes plugin setup, and returns the
application without running connection, runtime, or transport phases. Direct
construction remains available and leaves setup lazy until `initialize()` or
`start()`.

The application retains its exact configured schema and plugin tuples. Public
`getPlugin(name)` accepts top-level and nested literal plugin names and resolves
the setup export for the matching definition. A widened runtime plugin collection
returns `unknown` rather than claiming a type relationship that was erased.

Application `start`, `stop`, and `dispose` delegate to the lifecycle manager.
Each application therefore has independent state and follows the ordering,
idempotence, and cleanup semantics defined by ADR-0049.

## Consequences

Several applications can run concurrently in one process without sharing
schemas, services, contributions, plugin exports, or lifecycle state. Tests and
multi-tenant hosts may construct isolated instances from the same immutable
definitions.

Plugin setup remains declaration-only by contract. Plugins must defer external
connections and transport listeners to their explicit lifecycle hooks so
application creation stays free of infrastructure mutation.
