# 1411: Publish the plugin authoring toolbox

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/plugin-kit`, official plugins
- Depends on: 1408, 1417
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193

## Goal

Provide one public non-plugin package of focused ergonomic helpers that removes
proven duplication for community and official plugin authors without hiding
Core ownership or privilege boundaries.

## Acceptance criteria

- [ ] Create the `packages/plugin-kit` workspace and publish it as `@ultimabase/plugin-kit` without the `-plugin` suffix.
- [ ] Audit official plugins and milestone fixtures for repeated option freezing, structured plugin instances, namespaced identities, schema selectors, patches, handle extensions, operation definitions, middleware targets, codecs, Typegen references, and diagnostics.
- [ ] Add only helpers that protect one current invariant or replace duplication across at least two concrete consumers.
- [ ] Helpers return immutable precisely typed definitions, never accept `any`, and never obtain owner, privilege, registry, master, service, or adapter powers outside Core-provided facades.
- [ ] Every public helper has English JSDoc, a focused example, useful autocomplete, and deliberate root exports.
- [ ] Official plugins migrate applicable duplicate authoring code to the public helpers without changing behavior.
- [ ] The package README documents common plugin recipes, privilege implications, static-versus-runtime options, Typegen participation, and when to use Core directly.

## Tests

- [ ] Runtime, type, language-service, immutability, and packed-package tests cover every public helper and misuse boundary.
- [ ] Dependency constraints prove plugin-kit depends only on approved foundations and Core never imports plugin-kit.

## Out of scope

- Kernel security primitives such as owner binding, privilege checks, capability storage, or master authority.
- Helpers justified only by hypothetical future plugins.
