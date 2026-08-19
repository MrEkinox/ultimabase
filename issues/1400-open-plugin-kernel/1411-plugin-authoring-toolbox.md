# 1411: Publish the plugin authoring toolbox

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/plugin-kit`, official plugins
- Depends on: 1408, 1417
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193

## Goal

Provide one public non-plugin package of focused ergonomic helpers that removes
proven duplication for community and official plugin authors without hiding
Core ownership or privilege boundaries.

## Acceptance criteria

- [x] Create the `packages/plugin-kit` workspace and publish it as `@ultimabase/plugin-kit` without the `-plugin` suffix.
- [x] Audit official plugins and milestone fixtures for repeated option freezing, structured plugin instances, namespaced identities, schema selectors, patches, handle extensions, operation definitions, middleware targets, codecs, Typegen references, and diagnostics.
- [x] Add only helpers that protect one current invariant or replace duplication across at least two concrete consumers.
- [x] Helpers return immutable precisely typed definitions, never accept `any`, and never obtain owner, privilege, registry, master, service, or adapter powers outside Core-provided facades.
- [x] Every public helper has English JSDoc, a focused example, useful autocomplete, and deliberate root exports.
- [x] Official plugins migrate applicable duplicate authoring code to the public helpers without changing behavior.
- [x] The package README documents common plugin recipes, privilege implications, static-versus-runtime options, Typegen participation, and when to use Core directly.

## Tests

- [x] Runtime, type, language-service, immutability, and packed-package tests cover every public helper and misuse boundary.
- [x] Dependency constraints prove plugin-kit depends only on approved foundations and Core never imports plugin-kit.

## Out of scope

- Kernel security primitives such as owner binding, privilege checks, capability storage, or master authority.
- Helpers justified only by hypothetical future plugins.

## Audit outcome

- Published helpers bind stable module facts, normalize strict immutable option roots, compose additive schema patches, flatten operation-handler providers, and group nominal Typegen references.
- Schema selectors and model-handle extensions remain concise owner-bound Core registrars, so another wrapper would not remove proven duplication.
- Operation definitions, middleware targets, codecs, and destructive or cross-owner patches retain their explicit Core factories because their distinct policy and protocol fields should stay visible.
- Plugin-specific option diagnostics can retain an established message through `formatUnknownKey`; no generic diagnostic framework or registry was introduced.

## Validation

- `yarn typecheck`
- `yarn test` — 342 files and 2,010 tests passed.
- `yarn test:coverage` — 88.03% statements, 80.26% branches, 92.50% functions, and 88.21% lines.
- `yarn lint` — passed with only the repository's tracked size warnings.
- `yarn constraints`
- `yarn format:check`
- `yarn build` — package builds, `attw`, and `publint` passed.
- `yarn test:pack:built` — 11 files and 56 tests passed.
- `yarn test:e2e:built` — 34 files and 136 tests passed through Docker/Testcontainers outside the filesystem sandbox.
