# 2602: Declare plugin-owned schema mutations

- Status: ready
- Milestone: 26
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`
- Depends on: 2601
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Add the generic static declaration and application-owned handle contract for a
plugin-defined mutation bound to one exact schema, without adding any concrete
operation name to Core.

## Acceptance criteria

- [ ] A public immutable factory declares a canonical namespaced mutation
      identity, target requirements, input, result, errors, transaction policy,
      and transport eligibility.
- [ ] Authorized plugins attach a mutation to frozen schema targets through an
      owner-scoped deterministic contribution with stable provenance.
- [ ] Static descriptors are callback-free and can be inspected during
      application compilation; executable handlers use a separate
      application-lifetime capability.
- [ ] Application schema and model handles expose exact typed commands without
      mutating exported schema classes or prototypes.
- [ ] Conflicting names, owners, targets, versions, contributions, model
      surfaces, and stale generated declarations fail before setup effects.
- [ ] Plugin Kit wraps only repeated authoring boilerplate and preserves every
      Core ownership, privilege, and validation boundary.
- [ ] Typegen emits inert application-specific schema and model command
      declarations while JavaScript executes the same compiled graph without
      generated files.
- [ ] Core schema examples and public package documentation demonstrate a
      neutral workflow mutation rather than soft-delete-specific vocabulary.

## Tests

- [ ] Runtime declaration tests cover immutability, deterministic ordering,
      ownership, collisions, two plugin instances, and no-Typegen JavaScript.
- [ ] Compile-time and language-service tests cover literal schemas, runtime
      names, exact command input/result types, autocomplete, and package exports.

## Out of scope

- Executing the mutation, transport generation, official Access or Hooks
  integration, or a soft-delete package.
