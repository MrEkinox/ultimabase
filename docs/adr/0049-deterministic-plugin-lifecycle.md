# ADR-0049: Deterministic plugin lifecycle

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0003, ADR-0015, ADR-0048
- Refined by: ADR-0190

## Decision

Each application owns one `PluginLifecycleManager` built from its resolved
`PluginGraph` and `PluginSetupRegistries`. The manager runs setup callbacks in
dependency order and stores each result with the owner-bound context for that
exact plugin definition. Setup is a separate public phase so application-level
validation can inspect all declarations before infrastructure changes begin.

Startup first ensures setup has completed, then runs `connect`, `prepareSchema`,
`startRuntime`, and `startTransports`. Every phase visits the complete graph in
dependency order before the next phase begins. A plugin lifecycle context carries
the export returned by that plugin's own setup callback.

Stop visits active plugins in reverse dependency order. Dispose visits every
plugin whose setup completed in reverse dependency order, then disposes the
application service registry. A partial setup or startup failure performs the
same cleanup automatically. Teardown continues when one callback fails; cleanup
failures are aggregated with the original failure instead of hiding it.

Concurrent or repeated calls share the phase's in-flight promise and never repeat
completed work. Stop before startup is a no-op. A stopped or disposed lifecycle
cannot be started again, and disposal is terminal.

## Consequences

Plugin authors can acquire resources in explicit phases while Core guarantees a
stable ordering and rollback boundary. Extension validation may run between
setup and connection without adding a special lifecycle hook or infrastructure
dependency to Core.

The lifecycle manager exposes setup output as `unknown`; literal-name narrowing
belongs to the typed `FrameworkApplication` facade because a runtime graph alone
does not retain the configured plugin tuple type.
