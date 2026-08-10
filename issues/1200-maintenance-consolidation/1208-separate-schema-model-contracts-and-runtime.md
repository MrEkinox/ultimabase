# 1208: Separate schema-model contracts from runtime materialization

- Status: planned
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1207
- ADR: ADR-0109, ADR-0115, ADR-0132, ADR-0151

## Goal

Separate public schema-model type contracts from private class construction,
state storage, command delegation, and result materialization without changing
the immutable model API.

## Acceptance criteria

- [ ] Draft, prepared-draft, persisted-result, selection, command, and capability types live in focused contract modules.
- [ ] WeakMap state, constructor keys, class creation, command delegation, and materialization live in focused runtime modules.
- [ ] One composition entry retains the exact `SchemaClass`, `SchemaDraft`, `SchemaResult`, and capability surface exported today.
- [ ] Draft and persisted state cannot be forged or confused after the split.
- [ ] Immutable snapshots, `instanceof`, pointer identity, `toJSON`, selections, relations, and contextual command execution remain unchanged.
- [ ] Remaining type assertions at class-construction boundaries document the invariant they bridge and have focused runtime and type evidence.
- [ ] No new public subpath, deep package import, mutable Active Record behavior, or persistence method is introduced.

## Tests

- [ ] Existing model runtime, type, selection, command, relation, pointer, and language-service suites pass.
- [ ] Packed Core and generated application tests prove identical public hovers and result inference.
- [ ] Focused tests protect private construction keys and materialization-state invariants.

## Out of scope

- Changing schema construction or generated type authority.
- New model commands or dirty tracking.
- Extracting Schema into another package.
