# ADR-0151: Persisted model read and identity helpers

- Status: Accepted
- Date: 2026-08-06

## Context

Persisted schema models already retain protected object identity for immutable
`update`, `delete`, and relation commands. Developers still had to rebuild a
Query to refresh an instance, test whether it remained readable, or recover an
exact Pointer. Comparing two model identities also required exposing or
manually comparing selected identifiers.

Visible fields cannot be the source of these operations because a valid Query
selection may omit `id`. Retaining the exact schema type directly in every
command result also makes TypeScript expand concrete field definition types in
unrelated command hovers.

## Decision

Trusted persisted models expose four additional immutable helpers:

```ts
const fresh = await post.fetch({ select: { id: true, title: true } }, options)
const readable = await post.exists(options)
const pointer = post.toPointer()
const sameObject = post.equals(pointer)
```

`fetch` delegates to Query `get` with the protected identifier and returns
`null` when the object is absent or unreadable. Its literal `select` uses the
same exact flat selection contract as other instance commands. An empty input
returns the complete Access-permitted model.

`exists` delegates to Query `exists` with a protected identifier predicate.
Both reads therefore use the ordinary Runtime pipeline, including Access,
hooks, execution ownership, and transaction reuse when invoked from a hook.

`toPointer` and `equals` perform no database I/O. They read only trusted private
model state. Equality requires both exact schema identity and object identifier;
a pointer or persisted model for another schema or identifier returns `false`.

The exact `Pointer<typeof Schema>` type is carried through one private type-only
symbol. Command result types propagate only that symbol with `Pick`, so chained
`fetch`, `update`, and `delete` results preserve exact pointer Query inference
without exposing concrete field definition types in unrelated editor hovers.

Draft models do not expose these helpers. Runtime methods still validate trusted
persisted state so borrowed or forged receivers cannot recover an identity.

## Consequences

- Refresh and existence checks share the same Access and hook semantics as
  equivalent Query reads.
- Local pointer conversion and equality remain safe when `id` is omitted from
  visible values.
- `toPointer().query()` retains exact field and operator autocomplete after any
  instance-command chain.
- No Active Record mutation state, dirty tracking, cache, or alternate database
  execution path is introduced.
- The generic create-many and upsert-many execution boundary explicitly
  normalizes TypeScript's hypothetical empty-schema result branch; runtime
  operation inference remains unchanged.
