# 1605: Publish a portable field-plugin authoring helper

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/plugin-kit`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/pg-vector-plugin`
- Depends on: 1509, 1603, 1604
- ADR: ADR-0173, ADR-0187, ADR-0192, ADR-0193

## Goal

Compose the repeated portable contracts needed by a community-defined field
kind while keeping database storage and query behavior in explicit
adapter-specific bridge plugins.

## Acceptance criteria

- [ ] Audit pg-vector and the existing open-kernel value-codec proof to identify only their shared current invariants before fixing the helper shape.
- [ ] Add one focused helper that binds a namespaced logical kind, immutable option normalization, value snapshot contract, FieldBuilder method, validation-plan guard, and exact Typegen references.
- [ ] Preserve the plugin author's public value, option, field, builder-method, and validation-plan types with useful autocomplete and JSDoc.
- [ ] The helper requests no privilege itself; the plugin keeps its exact schema declaration privilege and reason visible.
- [ ] Storage codecs, physical schema, filter compilation, persistence plans, migrations, raw adapters, and database packages remain separate explicit contributions.
- [ ] Migrate pg-vector and the value-codec proof without changing logical values, validation, generated fields, PostgreSQL storage, or JavaScript behavior.
- [ ] Document the minimum portable field plugin and the optional adapter bridge as separate recipes.

## Tests

- [ ] Runtime, type, language-service, source, packed, JavaScript, Typegen, and immutability tests cover the helper and migrated consumers.
- [ ] Negative tests cover invalid or duplicate kinds and builder names, unregistered storage, invalid options and values, missing privilege, incompatible Typegen references, and application isolation.

## Out of scope

- A universal field DSL or custom validation language.
- Assuming PostgreSQL, Drizzle, SQL, vector behavior, or one physical storage format.
- Adding a hypothetical field kind solely to justify abstraction.
