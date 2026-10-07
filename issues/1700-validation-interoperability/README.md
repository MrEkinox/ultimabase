# Milestone 17 — Validation interoperability

- Status: completed

Replace fragile local protocol machinery with focused, established public
standards where a current framework boundary proves the need. The milestone
first fixes structural equality for persisted JSON snapshots, then lets plugin
authors validate options through Standard Schema without coupling
`@ultimabase/plugin-kit` to a particular validation library.

Neither issue broadens Core's product responsibilities. JSON equality remains
an internal Core implementation detail, while Standard Schema support remains
a synchronous plugin-authoring convenience above Core.

## Execution order

1. [x] [1701 — Compare migration JSON snapshots structurally](1701-structural-json-snapshot-equality.md)
2. [x] [1702 — Accept Standard Schema plugin option validators](1702-standard-schema-plugin-options.md)

## Completion evidence

Adapter migration snapshots now use structural JSON equality without changing
identity serialization or richer Runtime comparisons. Plugin Kit accepts a
synchronous Standard Schema directly through its existing option parser,
preserves inferred input/output types, leaves unknown-key policy to the schema,
and retains the immutable plain-object result boundary.

Zod verifies real Standard Schema interoperability through source and packed
Runtime plus language-service tests; it remains a development dependency only.
The final gate passed constraints, typecheck, 1,898 tests, lint with zero errors,
build with clean `attw` and `publint`, 85 packed-consumption tests, and formatting.
