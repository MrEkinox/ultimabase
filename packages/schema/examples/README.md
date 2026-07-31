# Schema examples

These examples demonstrate the public `@ultimabase/schema` API through focused
TypeScript snippets:

- [`basic-schema.md`](basic-schema.md) introduces a schema and inferred types;
- [`field-options.md`](field-options.md) covers built-in fields, validation
  metadata, defaults, generation, and indexes;
- [`objects-and-lists.md`](objects-and-lists.md) composes reusable nested fields
  and multidimensional lists;
- [`inference-registry-and-plans.md`](inference-registry-and-plans.md) shows
  operation-specific types, schema registration, and validation plans.

The snippets intentionally use only public package exports. They are reference
documentation rather than executable fixtures, so the package build and test
suites do not include this directory.

## Maintenance rule

Every change to `@ultimabase/schema` must review these examples. Changes to
field behavior, schema composition, inference, registries, or validation plans
must update the affected example in the same issue.
