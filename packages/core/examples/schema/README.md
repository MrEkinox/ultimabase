# Schema examples

These examples demonstrate the public `@ultimabase/core` Schema API through focused
TypeScript snippets:

- [`basic-schema.md`](basic-schema.md) introduces a schema and inferred types;
- [`field-builder.md`](field-builder.md) introduces the canonical
  `fields: (field) => ({ ... })` declaration and restricted embedded builders;
- object-shaped field maps are reserved for internal tests and framework-owned
  composition that require local inference;
- [`field-options.md`](field-options.md) covers built-in fields, validation
  metadata, defaults, generation, and indexes;
- [`objects-and-lists.md`](objects-and-lists.md) composes reusable nested fields,
  typed one-dimensional lists, and explicit JSON matrices;
- [`pointers.md`](pointers.md) declares exact single-object references and
  immutable logical pointer values;
- [`relations.md`](relations.md) declares owning and inverse to-many topology
  and builds opaque, independently paginated relation queries without embedding
  collections in model records;
- [`explicit-relationships.md`](explicit-relationships.md) models edges with
  business data as ordinary schemas with exact pointers and composite
  uniqueness;
- [`extensions.md`](extensions.md) declares opaque schema and field metadata
  owned by a runtime plugin;
- [`plugin-transformations.md`](plugin-transformations.md) declares direct plugin
  options, stable and dynamic plugin schemas, application handles, frozen
  selectors, immutable patches, conflicts,
  and logical provenance;
- [`inference-registry-and-plans.md`](inference-registry-and-plans.md) shows
  operation-specific types, schema registration, and validation plans.

The snippets intentionally use only public package exports. They are reference
documentation rather than executable fixtures, so the package build and test
suites do not include this directory.

Concrete option namespaces are documented by their owning packages. See the
[`hooks-plugin`](../../../hooks-plugin/README.md) and
[`access-plugin`](../../../access-plugin/README.md) READMEs; Core examples do
not assume either engine is installed.

## Maintenance rule

Every change to Core's Schema domain must review these examples. Changes to
field behavior, schema composition, inference, registries, or validation plans
must update the affected example in the same issue.
