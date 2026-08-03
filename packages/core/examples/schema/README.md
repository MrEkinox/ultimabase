# Schema examples

These examples demonstrate the public `@ultimabase/core` Schema API through focused
TypeScript snippets:

- [`basic-schema.md`](basic-schema.md) introduces a schema and inferred types;
- [`field-options.md`](field-options.md) covers built-in fields, validation
  metadata, defaults, generation, and indexes;
- [`objects-and-lists.md`](objects-and-lists.md) composes reusable nested fields
  and multidimensional lists;
- [`pointers.md`](pointers.md) declares exact single-object references and
  immutable logical pointer values;
- [`relations.md`](relations.md) declares owning and inverse to-many topology
  and builds opaque, independently paginated relation queries without embedding
  collections in model records;
- [`hooks.md`](hooks.md) colocates exact-value field behavior and cross-field
  schema behavior;
- [`extensions.md`](extensions.md) declares opaque schema and field metadata
  owned by a runtime plugin;
- [`inference-registry-and-plans.md`](inference-registry-and-plans.md) shows
  operation-specific types, schema registration, and validation plans.

The snippets intentionally use only public package exports. They are reference
documentation rather than executable fixtures, so the package build and test
suites do not include this directory.

## Maintenance rule

Every change to Core's Schema domain must review these examples. Changes to
field behavior, schema composition, inference, registries, or validation plans
must update the affected example in the same issue.
