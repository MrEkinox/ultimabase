# 339: Introduce immutable UltimaObject results

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/schema`, `@ultimabase/query`, `@ultimabase/runtime`
- Depends on: 315, 331
- ADR: ADR-0005, ADR-0067, ADR-0093

## Goal

Represent persisted query results with a compact, immutable `UltimaObject`
class without introducing Active Record persistence.

## Target developer experience

```ts
const post = await ultimabase.query(PostSchema).select('id', 'title').first()

if (post !== null) {
	post.title
	post.get('title')
	post.toJSON()
}
```

## Acceptance criteria

- [ ] Singular and bulk terminal results expose immutable `UltimaObject` instances after the complete output-hook and field-restriction pipeline.
- [ ] Direct properties and `get(field)` preserve exact schema values, nullability, list depth, and selected-field narrowing.
- [ ] QuickInfo presents the class and selected result shape compactly instead of expanding internal field definitions.
- [ ] `toJSON()` returns an immutable or safely copied plain selected object suitable for transports and logging.
- [ ] Each instance retains its exact schema identity without exposing mutable registry or adapter state.
- [ ] Runtime materialization is performed once at the public result boundary and does not force database adapters to construct public classes.
- [ ] Create, update, upsert, find, first, get, and delete return contracts remain mutually consistent.
- [ ] The class has no `save`, `delete`, or hidden persistence method; writes continue through `Query` and `RequestEngine`.
- [ ] A refining ADR records the materialization boundary, serialization behavior, equality semantics, and compatibility with hooks.
- [ ] Public methods and properties provide concise English JSDoc, autocomplete, and examples.

## Tests

- [ ] Runtime tests cover immutability, schema identity, serialization, selection, and every terminal result family.
- [ ] Compile-time tests cover direct access, `get`, nullable fields, nested objects, lists, custom fields, and invalid unselected fields.
- [ ] Language-service and packed-package tests prove compact, readable hovers.
- [ ] PostgreSQL E2E tests prove that adapter records become `UltimaObject` instances only after Runtime processing.

## Out of scope

- Active Record persistence.
- Mutable dirty tracking or implicit write batching.
- Transport-specific response wrappers.
