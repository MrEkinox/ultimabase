# ADR-0029: Plugin-defined logical fields

- Status: accepted
- Date: 2026-07-31

## Decision

Field plugins may introduce logical field kinds through `definePluginField`.
Each kind uses a non-empty namespaced string and cannot reuse a framework-owned
field discriminant. Schema normalizes the common field contract while the
plugin supplies validation-metadata and scalar-value normalizers.

Compiled validation plans preserve an unrecognized logical field as an opaque
plugin plan containing its kind and complete immutable field definition.
Schema does not interpret plugin-specific options and does not silently omit
them. List wrappers remain framework-owned, so the plugin plan represents the
scalar item nested inside any declared list dimensions.

The application plugin registry will require exactly one installed capability
to claim each plugin field kind during setup. That registry, runtime validator,
and database compiler do not belong to Schema. A field plugin contributes those
capabilities for the relevant adapters; the logical field definition itself
does not expose PostgreSQL or Drizzle metadata.

Field extensions remain the mechanism for decorating an existing field kind.
A plugin-defined field is used when the plugin owns a distinct logical value
and needs its complete definition throughout planning and execution.

## Consequences

Community packages can define fields such as vectors without modifying
`@ultimabase/schema`, and future GraphQL or database plugins can claim their
typed metadata. Namespaced kinds prevent accidental collisions, while setup
validation will make missing or duplicate handlers explicit.

`@ultimabase/pg-vector-plugin` is the first proof of the contract. It defines a
fixed-dimension vector field and claims its opaque validation plan. SQL mapping
and pgvector infrastructure remain future PostgreSQL-plugin work.
