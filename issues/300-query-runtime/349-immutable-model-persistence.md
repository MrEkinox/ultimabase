# 349: Add immutable model persistence commands

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 339, 345, 348
- ADR: ADR-0005, ADR-0067, ADR-0108, ADR-0109, ADR-0115

## Goal

Give schema-specific immutable draft and persisted instances concise
`create`, `upsert`, `update`, and `delete` commands that delegate to the same
Query terminals and Runtime pipeline.

## Target developer experience

```ts
const draft = new Post({
	title: 'Hello',
})

const created = await draft.create()

const updated = await created.update({
	set: { title: 'Updated' },
})

await updated.delete()
```

Explicit root ownership and trusted authority stay in the final execution
options position:

```ts
const imported = await new Post({ title: 'Imported' }).create({
	ultimabase,
	useMasterKey: true,
})
```

## Acceptance criteria

- [x] `new Post(createInput)` returns an immutable typed draft and performs no I/O.
- [x] Draft instances expose `create(options?)` and `upsert(upsertOptions, executionOptions?)` with exact schema input and unique-conflict inference.
- [x] Successfully created, upserted, updated, or queried instances expose `update(input, options?)` and `delete(options?)` with exact schema and selection-aware results.
- [x] Supplying an `id` or forcing a TypeScript cast cannot make a newly constructed draft a trusted persisted instance at the JavaScript boundary.
- [x] Every command delegates to the matching Query terminal and therefore preserves validation, hooks, policy plugins, automatic transactions, cancellation, recursion protection, and adapter execution.
- [x] Ambient commands reuse the current application, request authority, transaction, and hook lease; explicit options follow ADR-0108 and ADR-0109.
- [x] Commands never mutate their receiver and return a new schema-class instance when the underlying Query terminal returns an object.
- [x] Partially selected or field-restricted instances retain only protected identity needed for targeting and never reveal hidden values through properties, `get`, update input, diagnostics, or `toJSON()`.
- [x] Collection and set-based operations remain on `Post.query()`; instances do not expose `createMany`, `updateMany`, `upsertMany`, or `deleteMany`.
- [x] No dirty tracking, implicit write batching, direct adapter call, mutable `set`, or automatic `save()` dispatch is introduced.
- [x] Public JSDoc and compact hovers distinguish draft and persisted operations with realistic examples.

## Tests

- [x] Runtime tests prove exact Query delegation, immutable receivers, new returned instances, missing identity rejection, lifecycle errors, and selected-result behavior.
- [x] Compile-time tests prove draft versus persisted method availability, exact create/update/upsert inputs, authority options, and selected outputs.
- [x] Security tests prove constructor input cannot forge persisted state or expose restricted fields.
- [x] Hook transaction tests prove instance commands share rollback, unawaited-operation tracking, cancellation, and closed leases.
- [x] Language-service and packed-package tests verify concise class names, autocomplete, JSDoc, and readable terminal options.
- [x] PostgreSQL E2E tests exercise all four instance commands through the same Runtime pipeline as their Query equivalents.

## Out of scope

- Mutable Parse-style objects or dirty tracking.
- A generic `save()` that chooses create or update implicitly.
- Static CRUD methods duplicated on the schema class.
- Persistence methods on `Role`, `ACL`, or other non-schema domain values.
