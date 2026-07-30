# @ultimabase/schema

Static schema declarations are the source of truth for UltimaBase.

Responsibilities:

- `defineSchema`;
- primitive field definitions;
- system-field metadata;
- schema and field extension contracts;
- indexes and declarative constraints;
- TypeScript inference;
- isolated `SchemaRegistry` instances.

This package must not know ACL, CLP, roles, PostgreSQL, Drizzle, Hono, or GraphQL. Optional capabilities contribute opaque, typed extensions that runtime plugins later claim.

## Generic field contract

- `FieldPresenceOptions` represents omission and nullability independently. Fields are optional and non-null by default, and `required: true` cannot be combined with `nullable: true`.
- `FieldOptions<TValue>` adds typed static defaults, field-value immutability, uniqueness, indexing, and descriptions without introducing database-specific metadata.
- `FieldDefinition<TKind, TValue, TOptions>` preserves the literal field kind, its base value type, and its exact readonly options for later schema inference.

These contracts are type-only. Concrete field factories will construct and freeze their runtime metadata in their dedicated implementations.
