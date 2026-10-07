# 2615: Select absent direct schema options deterministically

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/core`, documentation
- Depends on: 2601
- ADR: [ADR-0246](../../docs/adr/0246-schema-option-absence-and-static-plugin-powers.md)

## Goal

Let a plugin target application schemas that omit one exact direct option while
preserving early privilege policy, immutable capability composition, and the
callback-free schema compiler boundary.

## Acceptance criteria

- [x] `schemas.select({ option: { name, present: false } })` selects only schemas
      that omit the normalized direct option.
- [x] Existing presence and structural-equality selectors retain their exact
      behavior and public types.
- [x] `present: true`, `present` combined with `equals` or `path`, callbacks,
      boolean combinators, and unknown selector keys fail deterministically.
- [x] The option name resolves against one exact owner; unknown or ambiguous
      definitions fail before plugin setup or infrastructure effects.
- [x] The new inert selector crosses the public callback-free compiler input,
      replacement validation, and frozen selection result without exposing
      option callbacks or values.
- [x] The schema compiler protocol version advances and documentation explains
      the compatibility requirement.
- [x] Plugin privilege and capability declarations remain one fixed truthful
      potential-power set evaluated before schema compilation; no second dynamic
      graph is introduced.

## Tests

- [x] Runtime, type, compiler-IR, replacement-compiler, unknown-owner,
      ambiguous-owner, opaque-option, immutability, and package-export tests pass.
- [x] Existing selector and complete repository checks show no regression.

## Evidence

- `yarn vitest run --project unit packages/core/src/plugins/schema-option-presence.test.ts packages/core/src/plugins/schema-compiler-ir/validation.test.ts packages/core/src/plugins/schema-compiler-ir/schema-compiler-capability.test.ts packages/core/tests/plugins/schema-compiler-ir-language-service.test.ts`
- `yarn vitest run --project types packages/core/src/plugins/schema-declarations.test-d.ts packages/core/src/plugins/schema-compiler-ir/contracts.test-d.ts`
- `yarn vitest run --project e2e tests/e2e/core-schema-compiler-ir.e2e.test.ts`
- `yarn workspace @ultimabase/core typecheck`
- `yarn workspace @ultimabase/core build`
- `yarn typecheck`
- `yarn test`
- `yarn lint:core` (passes with the existing centralized line-budget warnings)

## Out of scope

- General negation, OR selectors, callbacks, post-compilation manifests, dynamic
  capabilities, or soft-delete-specific Core behavior.
