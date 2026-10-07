# 1702: Accept Standard Schema plugin option validators

- Status: completed
- Milestone: 17
- Packages: `@ultimabase/plugin-kit`
- Depends on: none
- ADR: ADR-0211

## Goal

Let plugin authors pass a Standard Schema validator directly to
`definePluginOptionsParser` while preserving synchronous static plugin
declarations and strict immutable normalized option results.

## Acceptance criteria

- [x] `definePluginOptionsParser` accepts either its existing keys-and-normalizer contract or one Standard Schema validator.
- [x] The Standard Schema owns unknown-key behavior and inferred input/output types without coupling Plugin Kit to Zod, Valibot, ArkType, or another implementation.
- [x] Validation failures retain useful issue paths and messages.
- [x] Asynchronous validation fails explicitly before plugin declaration effects.
- [x] Successful output remains a shallow-frozen plain object.
- [x] Public documentation demonstrates a strict object schema and explains synchronous-only validation.

## Tests

- [x] Runtime tests cover success, failure paths, transformed output, unknown-key ownership, non-object output, and asynchronous rejection.
- [x] Compile-time and language-service tests protect inference through source and packed public exports.
- [x] Plugin Kit typecheck, tests, lint, and build pass.

## Validation

- `yarn constraints`
- `yarn typecheck`
- `yarn test`: 350 files, 1,898 tests, including compile-time inference
- source Plugin Kit Runtime, dependency-boundary, public-export, and language-service tests: 4 files, 19 tests
- source and built Plugin Kit E2E: 2 files, 2 tests
- `yarn lint`: zero errors and 76 existing centralized file-size warnings
- `yarn build`, including clean `attw` and `publint` package checks
- `yarn test:pack:built`: 17 files, 85 tests
- `yarn format:check`

## Out of scope

- Depending on or re-exporting one concrete validation library.
- Making plugin factories or static declarations asynchronous.
- Moving plugin-option parsing into Core.
