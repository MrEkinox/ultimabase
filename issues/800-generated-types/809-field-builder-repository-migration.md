# 809: Migrate schema declarations to FieldBuilder

- Status: completed
- Milestone: 8
- Packages: public schema examples, documentation, schema specializations
- Depends on: 807
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Move the documented application DX from `fields: { ... }` maps to the canonical
Nexus-style builder declaration after the generated contract is complete.
ADR-0175 subsequently refined the imperative form into the single
map-returning `fields: (field) => ({ ... })` syntax now used by application,
test, and framework-owned schemas.

## Acceptance criteria

- [x] Public Core and official-plugin examples and documentation use the canonical builder syntax.
- [x] Test-only and framework-owned declarations use the same map-returning FieldBuilder shape as application schemas.
- [x] The pg-vector proof uses `field.vector()` and no application-facing example requires `field.custom()`.
- [x] Existing Access, hook, validation, default, index, extension, relationship, Query, and mutation behavior remains unchanged.
- [x] `Schema.define()` exposes one map-returning FieldBuilder declaration without a separate field-map overload.
- [x] Low-level factories retained for plugin authors have explicit documentation and do not compete with the canonical application autocomplete surface.
- [x] README, Architecture, package READMEs, schema examples, ADR indexes, issue references, and generated-file guidance describe one current syntax.
- [x] Repository-owned generated declarations are produced through the public `@ultimabase/codegen` API without depending on a CLI command.
- [x] Unrelated user-owned working-tree changes remain untouched throughout the migration.

## Tests

- [x] Every migrated public example and specialized declaration passes focused runtime, compile-time, language-service, and public-export tests.
- [x] A before/after runtime metadata comparison proves the manual repository migration preserved schema definitions.

No codemod is introduced: UltimaBase has no published application declaration
surface to migrate yet, so maintaining a general source transformer would add
cost without a current consumer.

## Evidence

Core, plugin, conceptual, and architecture documentation now present
`fields(field)` as the application syntax. `RoleSchema.define()` accepts the
same builder declaration before adding its reserved role fields, while its map
overload and Core's map foundation remain available to internal tests.

ADR-0175 later replaces that imperative declaration and the internal map
overload with one `fields: (field) => ({ ... })` syntax. Generated `TypeInfo`
also becomes the precise application typing authority, with safe Core bootstrap
fallbacks before generation.

Focused metadata, role specialization, generated-language-service, and packed
FieldBuilder/pg-vector/codegen tests pass. Repository `typecheck`, unit/type
tests, lint, and build also pass. The complete packed E2E command still exposes
one unrelated stale hook-hover expectation: its fixture no longer contains the
historical `hover:create-result` marker.
