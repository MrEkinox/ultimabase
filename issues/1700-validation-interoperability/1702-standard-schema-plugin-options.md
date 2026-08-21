# 1702: Accept Standard Schema plugin option validators

- Status: ready
- Milestone: 17
- Packages: `@ultimabase/plugin-kit`
- Depends on: none
- ADR: pending

## Goal

Let plugin authors pass a Standard Schema validator directly to
`definePluginOptionsParser` while preserving synchronous static plugin
declarations and strict immutable normalized option results.

## Acceptance criteria

- [ ] `definePluginOptionsParser` accepts either its existing keys-and-normalizer contract or one Standard Schema validator.
- [ ] The Standard Schema owns unknown-key behavior and inferred input/output types without coupling Plugin Kit to Zod, Valibot, ArkType, or another implementation.
- [ ] Validation failures retain useful issue paths and messages.
- [ ] Asynchronous validation fails explicitly before plugin declaration effects.
- [ ] Successful output remains a shallow-frozen plain object.
- [ ] Public documentation demonstrates a strict object schema and explains synchronous-only validation.

## Tests

- [ ] Runtime tests cover success, failure paths, transformed output, unknown-key ownership, non-object output, and asynchronous rejection.
- [ ] Compile-time and language-service tests protect inference through source and packed public exports.
- [ ] Plugin Kit typecheck, tests, lint, and build pass.

## Out of scope

- Depending on or re-exporting one concrete validation library.
- Making plugin factories or static declarations asynchronous.
- Moving plugin-option parsing into Core.
