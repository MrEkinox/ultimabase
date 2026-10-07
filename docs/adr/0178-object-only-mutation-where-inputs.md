# ADR-0178: Object-only schema mutation predicates

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0132, ADR-0150

## Context

Schema mutation commands accepted either a canonical `WhereInput` object or a
callback receiving `WhereBuilder`. The callback was a second public declaration
form for the same predicate, even though transport adapters and generated types
use the object form as their source of truth. Its generic function type also
forced editor hovers for `updateOne()` and `deleteOne()` to expand the complete
schema class instead of showing the generated `TodoWhereInput` contract.

## Decision

Every schema mutation predicate accepts only `WhereInput<TSchema>`. This applies
to singular updates, deletions, and upserts; itemized collection mutations; and
immutable draft upserts. Generated schema contracts remain the typing authority,
so an application hover exposes its named generated where input.

`WhereBuilder` remains an optional immutable utility. Developers who prefer it
build the canonical object before passing it to a mutation:

```ts
const where = new WhereBuilder(Todo).eq('id', todoId).build()

await Todo.updateOne({ where, data: { completed: true } })
```

Runtime normalization continues to validate untrusted values independently of
the TypeScript declaration.

## Consequences

- Mutation predicates have one serializable declaration form shared with future
  REST and GraphQL inputs.
- Mutation hovers show generated where contracts instead of expanding the full
  schema definition through a callback type.
- Existing callback-form mutation calls must be rewritten as canonical objects
  or explicit `WhereBuilder.build()` results.
- Access policy callbacks are unaffected; they remain executable policy rules,
  not mutation input data.
