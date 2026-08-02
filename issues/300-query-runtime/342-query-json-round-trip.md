# 342: Add schema-aware Query JSON round trips

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 306, 347
- ADR: ADR-0052, ADR-0058, ADR-0108

## Goal

Convert immutable query-builder state to and from a concise, schema-aware JSON
representation so transport plugins can reuse Query validation without
reimplementing every builder operation.

## Target developer experience

```ts
const posts = await new Query(PostSchema)
	.fromJson({
		select: ['id'],
		equalTo: { published: true },
		greaterThan: { views: 100 },
	})
	.find({ ultimabase })

const json = new Query(PostSchema)
	.equalTo('published', true)
	.select('id')
	.toJson()
```

## Acceptance criteria

- [ ] `Query` exposes immutable `fromJson()` and `toJson()` boundaries without adding terminal execution state to serialized data.
- [ ] The JSON contract covers selection, primitive filters, ordering, limit, offset, and cursor position with concise schema-field autocomplete.
- [ ] Short filter records such as `equalTo: { published: true }` preserve exact field-to-value typing.
- [ ] A statically declared `select` preserves exact terminal result inference, while dynamic transport input returns a safe result type that never promises unselected fields.
- [ ] Runtime normalization rejects unknown properties, unknown fields, unsupported operators, incompatible values, conflicting pagination, and caller-owned mutation after import.
- [ ] `toJson()` returns data accepted by `JSON.stringify()` and `fromJson()` reconstructs the same representable query semantics.
- [ ] Native bigint and binary operands receive explicit lossless JSON encodings; plugin-defined values require a dependency-neutral codec contract before support is promised.
- [ ] Ordering priority and repeated compatible filters round-trip without silent loss, even when the concise object form needs an additional canonical representation internally.
- [ ] The JSON shape contains only builder state and never `find`, `first`, `get`, `count`, `exists` terminal execution, create, update, upsert, delete, engine, request, transaction, or authority data.
- [ ] The JSON contract exposes no `and`, `or`, or `not` keys; logical composition continues to accept complete `Query` instances through the class API.
- [ ] Serializing a logical AST that the JSON contract cannot represent fails explicitly instead of omitting or broadening filters.
- [ ] A refining ADR settles the JSON compatibility policy, selection inference, value codecs, ordering representation, and non-representable-query behavior before implementation.
- [ ] Public methods and nested input options provide concise English JSDoc, autocomplete, examples, and compact hovers.

## Tests

- [ ] Runtime round-trip tests cover every supported builder clause, immutable snapshots, malformed JavaScript input, bigint, binary, pagination conflicts, and unsupported logical trees.
- [ ] Compile-time tests cover short filter records, exact selected results, dynamic selections, invalid fields, incompatible values, and forbidden terminal properties.
- [ ] TypeScript language-service tests verify nested option documentation, autocomplete, and readable QuickInfo.
- [ ] Packed-package tests prove the same public declaration experience used by transport plugins.

## Out of scope

- Serializing or executing terminal operations.
- JSON-owned `and`, `or`, or `not` composition.
- Transport-specific GraphQL, REST, or HTTP request shapes.
- Treating Query JSON as trusted input or allowing it to carry master authority.
