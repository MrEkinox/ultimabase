# 1208: Separate schema-model contracts from runtime materialization

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1207
- ADR: ADR-0109, ADR-0115, ADR-0132, ADR-0151

## Goal

Separate public schema-model type contracts from private class construction,
state storage, command delegation, and result materialization without changing
the immutable model API.

## Acceptance criteria

- [x] Draft, prepared-draft, persisted-result, selection, command, and capability types live in focused contract modules.
- [x] WeakMap state, constructor keys, class creation, command delegation, and materialization live in focused runtime modules.
- [x] One composition entry retains the exact `SchemaClass`, `SchemaDraft`, `SchemaResult`, and capability surface exported today.
- [x] Draft and persisted state cannot be forged or confused after the split.
- [x] Immutable snapshots, `instanceof`, pointer identity, `toJSON`, selections, relations, and contextual command execution remain unchanged.
- [x] Remaining type assertions at class-construction boundaries document the invariant they bridge and have focused runtime and type evidence.
- [x] No new public subpath, deep package import, mutable Active Record behavior, or persistence method is introduced.

## Tests

- [x] Existing model runtime, type, selection, command, relation, pointer, and language-service suites pass.
- [x] Packed Core and generated application tests prove identical public hovers and result inference.
- [x] Focused tests protect private construction keys and materialization-state invariants.

## Validation evidence

- The former schema-model implementation is now composed from focused contract,
  lifecycle-state, capability, command, generated-class, and Runtime
  materialization modules. `model.ts` remains the single internal composition
  entry and the Core root export surface is unchanged.
- Framework-created constructors are registered privately before Runtime may use
  their construction protocol. Focused runtime coverage proves that a lookalike
  symbol cannot forge persisted state and that visible identity cannot conflict
  with protected materialization identity.
- A colocated compile-time lifecycle test keeps draft, prepared-draft, and
  persisted commands distinct and proves that the public constructor cannot
  accept a private construction key. Existing model, selection, relation,
  pointer, command, hook, Access, and materialization tests pass unchanged.
- Class-composition and materialization assertions now document the exact
  constructor or projection invariant they restore. The touched model area has
  six assertions instead of the former twenty, with no `any` introduced.
- Schema examples were reviewed; no update is required because field behavior,
  composition, inference, registry behavior, and validation plans are
  unchanged.
- Repository tests pass with 286 files and 1,811 tests, including compile-time
  checks. Constraints, typecheck, lint, formatting, build, and Changesets
  validation pass.
- Packed-package validation passes with 7 files and 45 tests. Packed Core and
  generated Typegen consumers retain public hovers and result inference, and
  private constructor, state, and materialization names do not leak into the
  Core root declaration.

## Out of scope

- Changing schema construction or generated type authority.
- New model commands or dirty tracking.
- Extracting Schema into another package.
