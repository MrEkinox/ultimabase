# 809: Migrate schema declarations to FieldBuilder

- Status: planned
- Milestone: 8
- Packages: all schema-declaring packages, examples, tests
- Depends on: 807
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Move the repository and documented application DX from `fields: { ... }` maps
to the canonical Nexus-style `fields(field) { ... }` declaration after the
generated contract is complete.

## Acceptance criteria

- [ ] A reviewed codemod handles ordinary fields, options, nested objects, pointers, relations, reusable definitions, schema specializations, and plugin-owned fields without changing declaration order.
- [ ] Core, official plugins, root tests, PostgreSQL E2E fixtures, examples, and documentation use the canonical builder syntax.
- [ ] The pg-vector proof uses `field.vector()` and no application-facing example requires `field.custom()`.
- [ ] Existing Access, hook, validation, default, index, extension, relationship, Query, and mutation behavior remains unchanged.
- [ ] The old application-facing field-map overload is removed only after source and packed language-service fixtures prove the replacement.
- [ ] Low-level factories retained for plugin authors have explicit documentation and do not compete with the canonical application autocomplete surface.
- [ ] README, Architecture, package READMEs, schema examples, ADR indexes, issue references, and generated-file guidance describe one current syntax.
- [ ] Repository-owned generated declarations are produced through the public `@ultimabase/codegen` API without depending on a CLI command.
- [ ] Unrelated user-owned working-tree changes remain untouched throughout the migration.

## Tests

- [ ] Every migrated package passes focused runtime, compile-time, language-service, and public-export tests.
- [ ] A before/after runtime metadata snapshot proves the codemod preserved schema definitions.
