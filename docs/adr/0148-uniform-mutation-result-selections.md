# ADR-0148: Uniform mutation result selections

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0145, ADR-0147
- Refined by: ADR-0164

ADR-0164 removes non-atomic successful-prefix results. The uniform mutation
selection and command-envelope decisions remain accepted for atomic
item-oriented collections.

## Context

Singular create, update, and delete commands already accept the same flat
selection object as Query reads. `upsert`, `createMany`, and `upsertMany` still
returned complete models without a way to restrict their payload. The bulk
commands also accepted a raw array, leaving no canonical command object in
which transports can represent a result selection.

Selections must shape only developer-visible results. Runtime hooks, Access,
model identity, transaction events, and later immutable model commands still
need the complete persisted mutation materializations.

## Decision

Every schema mutation that returns models accepts `select`. Singular upsert
adds it to its existing command object:

```ts
const post = await Post.upsert({
	where: { slug: { eq: 'hello' } },
	create: { slug: 'hello', title: 'Hello' },
	update: { title: 'Hello again' },
	select: { id: true, title: true },
})
```

Bulk create and upsert use one canonical envelope with `data` and an optional
selection shared by every returned model:

```ts
const created = await Post.createMany({
	data: rows,
	select: { id: true, title: true },
})

const imported = await Post.upsertMany({
	data: items,
	select: { id: true, title: true },
})
```

Omitting `select` preserves the existing complete-model result for create and
upsert operations. Both atomic arrays and non-atomic successful prefixes use
the same projection. The Operation AST always stores one normalized result
selection for `create-many` and `upsert-many`.

Database adapters project only the public result. They retain complete private
materializations for Runtime validation, hooks, Access, identity metadata, and
transaction events. Draft instance `create()` remains a separate immutable
model command and does not gain a second command envelope in this decision.

## Consequences

- Every model-returning schema mutation now shares one flat selection contract.
- REST and GraphQL transports can normalize bulk write payloads without parsing
  builder chains or inventing a separate projection channel.
- Bulk inputs have one consistent command-object shape instead of a raw array.
- Selected results remain lightweight without weakening internal lifecycle data.
- Existing raw-array `createMany` and `upsertMany` calls must migrate to `data`.
