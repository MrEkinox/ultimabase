# ADR-0314: Pointers are created by their schema only

- Status: accepted
- Date: 2026-10-10
- Refines: ADR-0118 (transport-neutral pointers) and ADR-0308 (link vocabulary); applies ADR-0288
- Approval: decided and accepted by the user on 2026-10-10 during the review of Core migration
  step 2

## Context

Two public forms create the same value: `Todo.pointer(id)` and `new Pointer(Todo, id)`. The
documentation presents the constructor as the "equivalent general form". Migration step 2 made
`Pointer` generic over a schema or a class name so that hovers print `Pointer<"Todo">`; as a side
effect `new Pointer('Todo', id)` type-checks and fails at runtime. ADR-0308 removes pointers from
link inputs (`{ connect: id }`), which leaves `Schema.pointer(id)` for comparisons, filters and ACL
entries, and no case where an application needs the constructor.

## Decision

1. **One public form.** `Schema.pointer(id)` is the only public way to create a `Pointer`. It is
   typed by its schema and accepts no class name.
2. **The constructor is not public.** `new Pointer(...)` is a type error outside Core, and at
   runtime it fails with a `TypeError` whose message shows `Schema.pointer(id)`. Core creates
   pointers through an internal factory.
3. **`Pointer` stays exported** as a type (annotations, `Pointer<"Todo">` hovers) and as a class
   value for `instanceof Pointer` checks, which plugins use.
4. Plugins that construct pointers (Access, PostgreSQL, REST, Roles) call `schema.pointer(id)` on
   the schema they already hold.

## Consequences

- Public tests that call `new Pointer(...)` switch to `Schema.pointer(id)`; a type test proves the
  constructor is not callable and that `Schema.pointer` rejects a class name.
- The DX audit reports the constructor signature removal and the changed `Pointer` hovers.
- Documentation impact: both (`relationships.mdx`, Core README, `packages/core/docs/schema.md`).

## Out of scope

Link inputs (ADR-0308), pointer serialization and `PointerValue`.
