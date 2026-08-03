# Current plan: transport-neutral pointers and relations

- Status: active
- Prepared: 2026-08-03
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres`
- Governing decisions: [ADR-0004](docs/adr/0004-one-operation-engine.md), [ADR-0055](docs/adr/0055-deterministic-query-clause-normalization.md), [ADR-0063](docs/adr/0063-portable-database-adapter-boundary.md), [ADR-0099](docs/adr/0099-automatic-mutation-transactions.md), [ADR-0109](docs/adr/0109-constructible-schema-models.md), [ADR-0115](docs/adr/0115-immutable-model-commands.md), [ADR-0116](docs/adr/0116-fundamental-access-system.md), [ADR-0118](docs/adr/0118-transport-neutral-relations.md)
- Previous completed objective: [Fundamental Access system](docs/plans/completed/fundamental-access-system.md)

## Objective

Add precisely typed pointers and queryable relations as foundational Core
concepts, then prove their complete Runtime, Access, hook, transaction, and
PostgreSQL behavior without involving REST or GraphQL.

The finished vertical targets this developer experience:

```ts
const UserSchema = Schema.define({
	className: 'User',
	fields: {
		name: stringField({ validation: { required: true } }),
	},
})

const TagSchema = Schema.define({
	className: 'Tag',
	fields: {
		label: stringField({ validation: { required: true } }),
	},
})

const PostSchema = Schema.define({
	className: 'Post',
	fields: {
		author: pointerField({
			target: () => UserSchema,
			onDelete: 'restrict',
			validation: { required: true },
		}),
		tags: relationField({ target: () => TagSchema }),
		title: stringField({ validation: { required: true } }),
	},
})

const post = await PostSchema.query().create({
	author: UserSchema.pointer(user.id),
	title: 'Typed relations',
})

const selected = await PostSchema.query()
	.include('author', (author) => author.select('id', 'name'))
	.get(post.id)

const tags = post.relation('tags')
await tags.connect(TagSchema.pointer(tag.id))

const page = await tags
	.query()
	.select('id', 'label')
	.ascending('label')
	.limit(20)
	.after()
	.find()
```

The exact spelling of a method may be refined by its issue when type and
runtime tests demonstrate a clearer API. The architectural boundaries and
security semantics below are fixed.

## Definition of done

The objective is complete only when:

- lazy relationship targets support circular declarations with exact inference and application-local validation;
- `Pointer<TSchema>` and `Relation<TSource, TTarget>` are small immutable public domain objects with concise hovers and focused JSDoc;
- pointer values are explicit and no relationship auto-loads database objects;
- pointer inclusion is selection-aware and limited to bounded single targets;
- to-many relations stay out of ordinary inferred model records and expose independently paginated target Queries;
- owning and inverse one-to-one, one-to-many, and many-to-many topologies validate deterministically;
- `connect`, `disconnect`, `set`, and `clear` use Runtime, Access, hooks, and automatic transactions;
- related reads and predicates preserve private relation scopes and complete target Access without leaking existence;
- PostgreSQL owns foreign-key and join-table representation, names, indexes, introspection, synchronization, and parameterized execution;
- relationship edges with business data use an explicit ordinary schema with two pointers;
- public Core plus PostgreSQL E2E tests prove the entire feature with no transport installed;
- Core imports no database or transport package and PostgreSQL uses only public Core contracts.

## Frozen decisions

- Relations are foundational Core behavior, not REST, GraphQL, or database-plugin inventions.
- `pointerField` represents one target and returns `Pointer<TSchema>` until explicitly included.
- Pointer fields cannot use `list`; one-to-one uses a unique pointer.
- Referential actions are explicit and default to `restrict`.
- `relationField` represents a to-many collection, never an embedded array.
- One relation side owns storage; `mappedBy` is a storage-free exact inverse.
- One-to-many uses an inverse pointer; many-to-many uses one owning relation; one-to-one uses a unique pointer.
- To-many values are absent from base create, update, persisted, selected, and JSON records.
- Persisted models expose relation handles only when protected source identity is available.
- Relation Query scopes and Access filters are private monotonic constraints that business hooks cannot remove.
- Related reads enforce source field disclosure and the target schema's complete Access lifecycle.
- Missing and inaccessible targets have identical observable behavior.
- Relation mutations reuse the update lifecycle and expose typed deltas instead of adding many new hooks.
- Inverse-pointer mutation executes the target pointer update with target validation, Access, and hooks.
- Join-row cleanup never implies deletion of related objects.
- Edge metadata requires an explicit relationship schema.
- `some`, `none`, and `every` belong to portable Core Query, not to GraphQL.
- Transport batching, DataLoader, route shapes, resolvers, and transport ID formats remain outside Core.

## Execution order

Complete one issue at a time. Do not start an issue whose dependencies are
incomplete.

### Phase 1 — Relationship identity

1. [x] [701 — Resolve lazy relationship schema targets](issues/700-extensions/701-lazy-relationship-targets.md)
2. [x] [702 — Add pointer fields and immutable Pointer values](issues/700-extensions/702-pointer-field.md)

### Phase 2 — Complete pointer vertical

3. [x] [737 — Add pointer Query contracts and inclusion](issues/700-extensions/737-pointer-query-contracts.md)
4. [x] [738 — Execute pointer reads and inclusion through Runtime](issues/700-extensions/738-pointer-runtime.md)
5. [x] [739 — Compile and execute PostgreSQL pointers](issues/700-extensions/739-postgres-pointer-storage.md)
6. [x] [740 — Verify the pointer vertical against PostgreSQL](issues/700-extensions/740-pointer-postgres-e2e.md)

### Phase 3 — Complete relation vertical

7. [x] [741 — Add owning and inverse relation fields](issues/700-extensions/741-relation-field-contracts.md)
8. [ ] [742 — Add immutable Relation handles and scoped queries](issues/700-extensions/742-relation-handle-and-query.md)
9. [ ] [743 — Execute transactional relation mutations](issues/700-extensions/743-relation-mutations.md)
10. [ ] [744 — Compile and execute PostgreSQL relations](issues/700-extensions/744-postgres-relation-storage.md)
11. [ ] [745 — Add portable relation predicates](issues/700-extensions/745-relation-predicates.md)

### Phase 4 — Explicit edges and final proof

12. [ ] [746 — Document explicit relationship models](issues/700-extensions/746-explicit-relationship-models.md)
13. [ ] [747 — Verify and audit the complete relations vertical](issues/700-extensions/747-relations-postgres-e2e.md)

## Resume protocol

When resuming after context loss:

1. Read `AGENTS.md`, ADR-0118, this file, and the current issue completely.
2. Read the Core README, PostgreSQL README when in scope, and the relevant focused package guides.
3. Inspect the working tree and preserve unrelated changes.
4. Confirm every dependency issue is `done` before marking the current issue `in-progress`.
5. Implement one issue only with colocated runtime, type, language-service, immutability, documentation, packed-export, and regression coverage justified by its public contract.
6. Keep physical storage behind versioned portable adapter capabilities and keep transports out of Core.
7. Run targeted checks, then the broader typecheck, test, lint, build, packed-package, and PostgreSQL E2E checks justified by the issue.
8. Create one dedicated commit only after the issue is complete; never push without explicit user confirmation.
9. Show the resulting developer-facing API before proposing the next issue.

## Current issue

[742 — Add immutable Relation handles and scoped queries](issues/700-extensions/742-relation-handle-and-query.md) is `ready`.

## Progress log

- 701 established lazy, application-local schema target resolution before plugin infrastructure starts.
- 702 added exact pointer fields, immutable logical Pointer values, referential metadata, and schema pointer conveniences.
- 737 added exact pointer predicates, ID-scoped Pointer queries, and immutable selection-aware inclusion AST contracts.
- 738 added versioned adapter capability checks and transaction-preserving, Access-aware nested pointer inclusion.
- 739 compiled pointer UUID columns, deterministic foreign keys, referential actions, codecs, predicates, introspection, and direct synchronization in PostgreSQL.
- 740 proved the complete pointer vertical through public Core and PostgreSQL exports with live CRUD, inclusion, Access, hooks, transactions, circular targets, constraints, and referential actions.
- 741 added exact owning and inverse relation fields, row-value omission, application-local topology diagnostics, and storage-neutral mapping metadata.
