# 6203: Specialize plugin-owned schemas without type bridges

- Status: planned
- Milestone: 62
- Packages: `@ultimabase/core`, `@ultimabase/password-auth-plugin`, `@ultimabase/roles-plugin`
- Depends on: 6202
- ADR: proposed

## Goal

Provide one Core-native typed schema specialization boundary for plugins that
add reserved fields, statics, or application capabilities to developer-provided
schema declarations.

## Acceptance criteria

- [ ] Password Auth and Roles no longer cast `Schema` or their result through `unknown` to reach specialization behavior.
- [ ] One canonical primitive replaces rather than supplements redundant internal definition paths.
- [ ] Reserved-field validation, exact class identity, field inference, statics, and capabilities remain unchanged.
- [ ] Ordinary `Schema.define()` remains the simplest developer path.
- [ ] Source and packed-package autocomplete and hover tests protect the authoring contract.
- [ ] Schema examples and public documentation are reviewed and updated where necessary.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Runtime specialization and reserved-field behavior.
- [ ] Compile-time Password User and Role schema inference.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- Mutable schema classes.
- Runtime prototype patching.
- A separate plugin-only schema compiler.
