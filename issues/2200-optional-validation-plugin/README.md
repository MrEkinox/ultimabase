# Milestone 22 — Optional field validation plugin

- Status: completed

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
4. [x] [2204 — Verify optional field validation](2204-optional-validation-verification.md)

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

ADR-0223 fixed the boundary, Core gained one generic final mutation-input guard,
and `@ultimabase/validation-plugin` now owns the direct `validation` option,
Standard Schema interoperability, application-local plans, issue mapping, and
projected arithmetic validation. Core no longer depends on Standard Schema and
applications that omit the plugin allocate no validation behavior.

The final gate passed constraints, issue validation, typecheck, unit and type
tests, lint, formatting, build, packed archives, public E2E, PostgreSQL
Testcontainers, and coverage. The complete coverage run passed 400 files and
1,856 tests with no type errors; package archives passed 19 files and 98 tests.
No milestone work was deferred.
