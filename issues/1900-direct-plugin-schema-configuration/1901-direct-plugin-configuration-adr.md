# 1901: Decide the direct plugin configuration replacement

- Status: ready
- Milestone: 19
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official plugins
- Depends on: none
- ADR: new ADR superseding ADR-0002's extension decision

## Goal

Define one extension-free schema authoring vocabulary and the exact migration
for every current schema-extension and field-extension consumer before changing
the compiler.

## Acceptance criteria

- [ ] The ADR inventories every production creator, reader, transformation, selector, compiler-IR node, provenance record, Typegen surface, and public export for schema and field extensions.
- [ ] Plugin-owned schema and field options are the only replacement for configuration attached to an existing schema or field.
- [ ] Plugin-defined fields remain the replacement when a plugin owns a distinct logical value, while schema patches or declared structural contributions own added fields and indexes.
- [ ] The ADR defines a generic option-owned structural contribution contract sufficient for ACL's reserved persisted field without naming ACL in Core.
- [ ] Direct options remain unknown at compile time and fail static application compilation when their owning plugin is absent; an installed plugin supplies exact autocomplete, normalization, provenance, Typegen, and Runtime compilation.
- [ ] The decision defines deterministic ownership, ordering, conflicts, removal, application isolation, callback handling, and compiler-IR representation.
- [ ] PostgreSQL table naming, PostgreSQL column rename intent, persisted ACL, and RoleSchema identity each receive one explicit replacement path.
- [ ] Access and Hooks extension-target helpers are removed unless the inventory proves a current non-test consumer that cannot use schema, field, field-kind, selector, or capability targeting.
- [ ] No compatibility aliases, deprecated overloads, legacy decoding, dual syntax, or replacement generic metadata bag are permitted.
- [ ] Query surface extensions are explicitly distinguished and left unchanged.

## Tests

- [ ] The ADR names the required runtime, type, Typegen, JavaScript, packed-package, migration, security, and PostgreSQL regressions for issues 1902 through 1907.
- [ ] `yarn check:issues` and `yarn format:check` pass.

## Out of scope

- Implementing the accepted replacement.
- Renaming query surface extensions.
- Changing plugin-field or capability semantics.
