# Plugins

A plugin factory returns a typed static definition. Setup produces a runtime instance and contributes services or handlers to registries.

Publishable plugin packages are explicit in both repository paths and imports:

```ts
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
```

The `-plugin` suffix is reserved for packages installed through the application
plugin graph. Foundations such as `@ultimabase/core` and development utilities
such as `@ultimabase/testing` do not use it.

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
