# 1603: Accept Standard Schema plugin options

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/plugin-kit`, official plugins
- Depends on: 1509, 1604

## Goal

Allow plugin factories to validate and infer immutable options through the
dependency-neutral Standard Schema contract instead of rewriting primitive
validation inside every `definePluginOptionsParser` normalizer.

## Acceptance criteria

- [ ] Add a Standard Schema-compatible option-parser path without adding Zod, Valibot, ArkType, or another validation implementation as a runtime dependency.
- [ ] Infer the exact validated output and retain useful diagnostics from the selected schema library.
- [ ] Reject asynchronous validation at the synchronous plugin-definition boundary with a focused diagnostic, unless an accepted ADR moves that boundary.
- [ ] Snapshot or freeze the validated root so caller mutation cannot alter plugin identity, declarations, capabilities, or setup behavior.
- [ ] Preserve the existing key-list and normalizer API for small dependency-free plugins.
- [ ] Unknown-key behavior belongs to the selected schema contract and is documented rather than silently imposed twice.
- [ ] Migrate at least two current option parsers where the Standard Schema path materially removes code.

## Tests

- [ ] Runtime, type, language-service, immutability, diagnostic, source, and packed tests use a structural Standard Schema fixture without requiring a specific schema library.
- [ ] Negative tests cover invalid output, promised validation, thrown diagnostics, caller mutation, symbols, and untrusted non-object input.

## Out of scope

- A new UltimaBase-specific validation language.
- Asynchronous plugin construction or setup-time static options.
- Validation of secrets after resource materialization.
