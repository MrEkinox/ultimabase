# 1906: Remove schema and field extensions

- Status: completed
- Milestone: 19
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, official plugins
- Depends on: 1903, 1904, 1905
- ADR: decision from issue 1901

## Goal

Delete the now-unused generic schema and field extension system across every
source, compiler, authoring, testing, and public-package boundary.

## Acceptance criteria

- [x] `SchemaOptions`, schema definitions, common field options, relations, plugin fields, validation plans, and generated declarations expose no `extensions` property.
- [x] `ExtensionDefinition`, `SchemaExtension`, `FieldExtension`, contextual binders, factories, list normalizers, target contexts, and extension-specific errors are deleted from Core exports.
- [x] Schema compiler IR, canonical operations, validation, encoding, decoding, provenance, fingerprints, transformations, patches, Typegen snapshots, and conformance fixtures carry no extension nodes.
- [x] Compiler IR and `schemaCompilerCapability` advance atomically from 3.0.0 to 4.0.0 and reject protocol 3 without a compatibility decoder.
- [x] Plugin Kit exposes no extension patch helper, and Access/Hooks expose no extension-target contribution helper.
- [x] Unknown direct options still fail when their plugin is absent, while installed plugins retain precise autocomplete and Runtime behavior.
- [x] The removal audit covers source barrels, compiled declarations, package archives, manifests, examples, active documentation, dependency constraints, and deep-import guards.
- [x] No compatibility alias, decoder, migration shim, deprecated overload, empty module, or alternate generic metadata container remains.
- [x] Historical ADRs and completed issues remain intact and are distinguished from active guidance.
- [x] File-size baselines decrease or disappear wherever the deletion permits.

## Tests

- [x] Runtime and type tests reject `extensions` on schemas and every field kind as an unknown option.
- [x] Public export, language-service, Typegen, JavaScript, Typegen-free, packed-package, archive, conformance, and application-isolation suites prove absence of the old surface.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Renaming query surface extensions.
- Removing plugin fields, direct options, schema patches, or capabilities.

## Validation

- `yarn constraints`
- `yarn typecheck`
- `yarn test` (352 files, 1,857 tests)
- `yarn lint`
- `yarn format:check`
- `yarn build`
- `yarn test:pack` (18 files, 87 tests)
- `yarn test:e2e:built` (48 files, 188 tests, including PostgreSQL)
