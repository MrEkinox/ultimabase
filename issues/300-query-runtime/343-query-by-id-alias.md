# 343: Add the Query byId alias

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 306, 309
- ADR: ADR-0058, ADR-0061

## Goal

Remove repeated `equalTo('id', object.id)` calls with one typed immutable
builder alias shared by every query terminal.

## Target developer experience

```ts
const updated = await ultimabase
	.query(PostSchema)
	.byId(created.id)
	.updateOne({ set: { title: 'Updated' } })
```

## Acceptance criteria

- [x] `Query.byId(id)` creates the same normalized equality filter as `equalTo('id', id)`.
- [x] `BoundQuery.byId(id)` preserves the exact engine, schema, selection, and terminal result types.
- [x] The identifier parameter retains the framework-owned identifier type inferred from the schema.
- [x] Existing filters remain combined through the regular implicit `AND` behavior.
- [x] Every terminal can reuse the alias without a new Operation AST or adapter path.
- [x] Every call returns a new immutable branch and leaves its source unchanged.
- [x] Public JSDoc and package documentation explain the alias with an update example.

## Tests

- [x] Runtime tests cover AST equivalence, existing-filter composition, immutability, and malformed JavaScript identifiers.
- [x] Compile-time tests cover unbound and bound identifier inference, engine preservation, selection preservation, and invalid identifiers.
- [x] TypeScript language-service tests verify concise parameter QuickInfo, documentation, and the developer example.

## Out of scope

- Adding separate `updateById`, `deleteById`, or `existsById` terminals.
- Changing `get(id)` or introducing another terminal operation kind.
- Active Record persistence attached to returned objects.
