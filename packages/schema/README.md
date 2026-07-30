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

- `FieldValidationOptions` represents omission and nullability inside the `validation` option. Fields are optional and non-null by default, and `required: true` cannot be combined with `nullable: true`.
- `FieldOptions<TValue, TValidation>` adds typed static defaults, field-value immutability, `indexed`, descriptions, and field extensions without introducing database-specific metadata. `indexed: true` requests a regular index, `indexed: "unique"` requests a unique index, and `false` disables indexing explicitly.
- `FieldDefinition<TKind, TValue, TOptions>` preserves the literal field kind, its base value type, and its exact readonly options for later schema inference.

These contracts are type-only. Concrete field factories will construct and freeze their runtime metadata in their dedicated implementations.

## String fields

`stringField(options)` creates immutable string metadata while preserving literal options for later schema inference. Calling `stringField()` defines an optional, non-null string.

String fields add declarative `validation.length.min`, `validation.length.max`, and `validation.match` constraints. Lengths must be non-negative safe integers, and `min` cannot exceed `max`. Match constraints use native `RegExp` values and are stored as metadata; validation is compiled by the runtime rather than executed by the field factory.

## Typed extensions

- `defineSchemaExtension(name, config)` creates plugin-owned schema metadata.
- `defineFieldExtension(name, config)` creates plugin-owned field metadata.
- `defineExtensions(extensions)` copies and freezes a list while rejecting duplicate names within the same scope.

Each extension exposes the literal `scope`, `name`, and typed readonly `config` properties. Schema transports this opaque configuration without interpreting it; the owning runtime plugin will provide its handler.

Schema and field names use separate namespaces. The same name may therefore exist once in each scope, while two schema extensions or two field extensions with the same name produce a `TypeError`. Extension values and their configuration objects are shallowly copied and frozen.
