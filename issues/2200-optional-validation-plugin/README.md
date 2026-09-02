# Milestone 22 — Optional field validation plugin

- Status: in-progress

Extract only application-owned field validation into the optional official
`@ultimabase/validation-plugin` package. The direct `validation` option keeps
its Standard Schema V1 contract and exact single-pass mutation semantics, but
is recognized only when the plugin is installed.

Core remains the structural authority. It owns required presence, nullability,
canonical scalar types, lists and embedded objects, pointer and relation
identity, enum domains, defaults, generators, immutable and generated rules,
decimal precision and scale, structural snapshots, transactions, and Runtime
orchestration. The plugin may reject a final structurally valid mutation value;
it may not transform it or redefine Core shape.

## Execution order

1. [x] [2201 — Decide the optional field-validation plugin boundary](2201-optional-field-validation-plugin-adr.md)
2. [x] [2202 — Add a final mutation-input guard boundary](2202-final-mutation-input-guard.md)
3. [x] [2203 — Extract the Standard Schema validation vertical](2203-extract-standard-schema-validation.md)
4. [ ] [2204 — Verify optional field validation](2204-optional-validation-verification.md)

## Deliberate boundaries

- `required` and all structural field metadata remain direct Core options.
- `validation` becomes one plugin-owned direct field option; there is no nested
  configuration object, provider protocol, global validator, or compatibility
  alias.
- Without `validationPlugin()`, Typegen omits the option, JavaScript or stale
  declarations fail application compilation when they use it, and Runtime
  allocates no application-validation behavior.
- With the plugin installed, each complete present non-null final mutation
  value is validated once after input resolution and before value-dependent
  enforcement.
- Reads, adapter results, materializations, inclusions, and final projections
  retain Core structural snapshots without application-validation replay.
- Arithmetic validation uses the complete projected value from stable prepared
  targets while preserving the original atomic adapter operation and current
  fail-closed target requirements.
- Master bypasses authorization only and never bypasses structural or installed
  application validation.
- Plugin Kit's separate Standard Schema support for plugin configuration stays
  unchanged.

## Completion evidence

Not implemented yet. Issue 2201 accepted ADR-0223 and fixed the implementation
order. Issues 2202 through 2204 own code, migration, and release evidence.
