# Plugins

A plugin factory returns a typed static definition. Setup produces a runtime instance and contributes services or handlers to registries.

Nested plugins are flattened into one graph:

```ts
postgresPlugin({
	plugins: [postgresMigrationPlugin()],
})
```

The graph validates missing dependencies, optional dependencies, conflicts, duplicates, and cycles before setup.

Ordering is deterministic:

1. dependency order;
2. configuration position for otherwise independent plugins.

Lifecycle teardown reverses setup order. A nested child implicitly depends on its parent.
