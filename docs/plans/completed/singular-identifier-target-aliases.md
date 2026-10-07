# Completed plan: singular identifier target aliases

- Status: complete
- Started: 2026-08-10
- Objective owner: `@ultimabase/core`, `@ultimabase/codegen`
- Governing decision: [ADR-0182](../../adr/0182-singular-id-target-aliases.md)
- Paused objective: [Generated schema authoring and type contracts](generated-schema-authoring-and-type-contracts.md)

## Objective

Allow schema-root `updateOne` and `deleteOne` commands to target one persisted
model through a concise top-level `id` alias while retaining their canonical
object `where` input and every existing execution semantic.

## Frozen constraints

- `id` is only public input sugar for `where: { id: { eq: id } }`.
- Exactly one of `id` or `where` must be supplied.
- The alias reuses the schema's existing `OperationObjectId` type.
- Normalization happens before Query and Operation AST construction.
- Runtime, Access, hooks, transactions, adapters, and missing-target behavior remain unchanged.
- `findOne`, `get`, `upsertOne`, instance commands, and collection commands remain out of scope.
- Generated contracts remain the source of exact application typing.
- Each issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

1. [x] [1001 — Add singular identifier target aliases](../../../issues/1000-singular-id-aliases/1001-singular-id-target-aliases.md)
2. [x] [1002 — Verify generated and packed identifier alias DX](../../../issues/1000-singular-id-aliases/1002-singular-id-alias-verification.md)

## Supervision checkpoints

- During 1001: stop if the alias requires an AST, Runtime, hook, Access, or adapter change.
- After 1001: demonstrate that both public forms normalize to the same canonical operation.
- After 1002: demonstrate autocomplete, compact hovers, mutual exclusion, and unchanged result inference through source and packed exports.

## Completion gate

- `updateOne({ id, data })` and `deleteOne({ id })` are accepted and precisely typed.
- Existing `where` inputs remain source-compatible.
- Supplying both or neither target fails through TypeScript and runtime validation.
- Equivalent `id` and `where` calls produce the same canonical Query and Operation AST.
- Existing Access, hooks, transactions, PostgreSQL behavior, and null-on-missing semantics do not regress.
- Core, Codegen, packed-package, typecheck, test, lint, constraints, formatting, and build checks pass.

## Final validation

- Core: 195 files, 1,395 tests, no type errors.
- Repository unit and type suites: 279 files, 1,752 tests.
- Packed packages: 5 files, 50 tests.
- Source codegen language-service fixture: 5 tests.
- The source and packed fixtures prove `id` and `where` completions, generated
  hovers, exact selected and included results, and exclusive target forms.
- The Runtime fixture proves both forms emit the same canonical operation
  predicate before the adapter boundary.
- Typecheck, lint, constraints, formatting, and build all pass.
- The PostgreSQL E2E scenario uses the aliases. Its local run could not start
  because no container runtime was available, so CI remains its execution gate.
