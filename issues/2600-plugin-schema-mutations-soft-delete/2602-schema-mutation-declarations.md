# 2602: Declare plugin-owned schema mutations

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`
- Depends on: 2601
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Add the generic static declaration and application-owned handle contract for a
plugin-defined mutation bound to one exact schema, without adding any concrete
operation name to Core.

## Acceptance criteria

- [x] A public immutable factory declares the accepted protocol-1 identity,
      payload, errors, authority, effect, returning phase, and persisted
      dependency selection without transport policy or an arbitrary result codec.
- [x] Authorized plugins attach a mutation to frozen schema targets through an
      owner-scoped deterministic contribution with stable provenance.
- [x] Static descriptors are callback-free and can be inspected during
      application compilation; executable handlers are retained separately for
      the application-lifetime Runtime capability delivered by issue 2603.
- [x] Application schema and model handles expose exact typed commands without
      mutating exported schema classes or prototypes.
- [x] Conflicting names, owners, targets, versions, contributions, model
      surfaces, and stale generated declarations fail before setup effects.
- [x] Plugin Kit wraps only repeated authoring boilerplate and preserves every
      Core ownership, privilege, and validation boundary.
- [x] Typegen emits inert application-specific schema and model command
      declarations while JavaScript executes the same compiled graph without
      generated files.
- [x] Core schema examples and public package documentation demonstrate a
      neutral workflow mutation rather than soft-delete-specific vocabulary.

## Tests

- [x] Runtime declaration tests cover immutability, deterministic ordering,
      ownership, collisions, two plugin instances, and no-Typegen JavaScript.
- [x] Compile-time and language-service tests cover literal schemas, runtime
      names, exact command input/result types, autocomplete, and package exports.

## Completion evidence

- Core exports immutable `defineSchemaMutation()` declarations with exact
  protocol-1 input, error, authority, effect, returning, and persisted-selection
  contracts while keeping compiled descriptors callback-free.
- Authorized `models.extend()` contributions install owner-attributed schema
  mutations on application schema handles and bound persisted-model views.
  Draft models reject the command, and execution remains explicitly unavailable
  until issue 2603 installs the Runtime provider.
- Compilation rejects malformed declarations and collisions before setup.
  Typegen snapshot version 10 and generated ABI 17 describe the same compiled
  application graph through inert, exact schema and model method declarations.
- Neutral Core and Plugin Kit documentation demonstrates the authoring contract
  without adding product-specific vocabulary or a wrapper that hides ownership
  and privilege checks.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
  `yarn build` passed. The full test suite passed 2,238 tests in 470 files; lint
  reported only the existing centralized line-budget warnings.

## Out of scope

- Executing the mutation, transport generation, official Access or Hooks
  integration, or a soft-delete package.
