# 1901: Decide the direct plugin configuration replacement

- Status: completed
- Milestone: 19
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official plugins
- Depends on: none
- ADR: ADR-0213

## Goal

Define one extension-free schema authoring vocabulary and the exact migration
for every current schema-extension and field-extension consumer before changing
the compiler.

## Acceptance criteria

- [x] The ADR inventories every production creator, reader, transformation, selector, compiler-IR node, provenance record, Typegen surface, and public export for schema and field extensions.
- [x] Plugin-owned schema and field options are the only replacement for configuration attached to an existing schema or field.
- [x] Plugin-defined fields remain the replacement when a plugin owns a distinct logical value, while ordinary schema patches own added fields and indexes.
- [x] The ADR defines generic option-presence selection plus ordinary patch composition sufficient for ACL's reserved persisted field without naming ACL in Core.
- [x] Direct options remain unknown at compile time and fail static application compilation when their owning plugin is absent; an installed plugin supplies exact autocomplete, normalization, provenance, Typegen, and Runtime compilation.
- [x] The decision defines deterministic ownership, ordering, conflicts, removal, application isolation, callback handling, and compiler-IR representation.
- [x] PostgreSQL table naming, PostgreSQL column rename intent, persisted ACL, and RoleSchema identity each receive one explicit replacement path.
- [x] Access and Hooks extension-target helpers are removed unless the inventory proves a current non-test consumer that cannot use schema, field, field-kind, selector, or capability targeting.
- [x] No compatibility aliases, deprecated overloads, legacy decoding, dual syntax, or replacement generic metadata bag are permitted.
- [x] Query surface extensions are explicitly distinguished and left unchanged.

## Tests

- [x] The ADR names the required runtime, type, Typegen, JavaScript, packed-package, migration, security, and PostgreSQL regressions for issues 1902 through 1907.
- [x] `yarn check:issues` and `yarn format:check` pass.

## Decision evidence

- ADR-0213 replaces configuration extensions with direct plugin options,
  distinct logical values with plugin fields, structural changes with ordinary
  owner-attributed patches, and cross-plugin integration with capabilities.
- The existing patch system already satisfies ACL's structural need. Issue
  1902 adds only `{ option: { name } }` presence selection for opaque values;
  it introduces no structural callback or renamed metadata bag.
- Compiler IR 3 adds presence selection while active consumers migrate. Final
  compiler IR 4 removes the extension artifact family after ACL, PostgreSQL,
  and Roles leave it, with no legacy decoder at either boundary.
- `acl`, schema and field `postgres`, and a nominal package-created RoleSchema
  marker have explicit direct-option migrations. The RoleSchema `WeakMap`
  remains the exact unforgeable domain identity.
- Access and Hooks extension-target helpers have no production consumer and
  are scheduled for deletion. Query surface extensions remain callable
  application-handle methods and are outside this milestone.

## Out of scope

- Implementing the accepted replacement.
- Renaming query surface extensions.
- Changing plugin-field or capability semantics.
