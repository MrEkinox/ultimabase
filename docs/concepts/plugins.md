# Plugins

A plugin factory returns a typed static definition. Its manifest declares a
stable plugin ID, an optional explicit instance ID, compatibility ranges,
privileges with reasons, environmental claims, dependencies, and versioned
capabilities. Static declarations compile the application graph; setup
materializes only the resource-backed application capabilities.

Publishable plugin packages are explicit in both repository paths and imports:

```ts
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
```

The `-plugin` suffix is reserved for packages installed through the application
plugin graph. Foundations such as `@ultimabase/core` and development utilities
such as `@ultimabase/testing` do not use it.

Every installed definition appears in one flat application list:

```ts
new UltimaBase({
	plugins: [postgresPlugin(), postgresMigrationPlugin()],
	schemas: [],
})
```

The graph validates missing and present optional dependencies, compatibility,
capability cardinality, explicit replacements, conflicts, duplicate identities,
and cycles before any plugin effect.

Ordering is deterministic:

1. dependency order;
2. configuration position for otherwise independent plugins.

Lifecycle teardown reverses setup order. Use a dependency when one plugin must
start after another, a peer for compatible identity without ordering, and a
capability when the required behavior may have interchangeable providers.

Cross-plugin integration uses only typed capabilities. `single`, `multiple`, and
`pipeline` tokens have deterministic composition rules and either `declaration`
or `application` lifetime. Public string slots, service lookup, and generic
registries were removed by milestone 14.

UltimaBase privileges govern framework-owned facades and are reported at
startup. Environmental claims separately disclose direct filesystem, network,
process, or native-code behavior; neither mechanism claims to sandbox trusted
in-process JavaScript.

See [Open plugin authoring](open-plugin-authoring.md) for the implemented
developer experience, including schema transformations, operations, Typegen,
transport bindings, adapter bridges, and JavaScript use without generated code.
