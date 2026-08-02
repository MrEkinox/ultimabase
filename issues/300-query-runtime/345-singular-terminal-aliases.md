# 345: Add concise singular terminal aliases

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 315, 343, 347
- ADR: ADR-0059, ADR-0067, ADR-0108, ADR-0109

## Goal

Complete the concise singular Query vocabulary with `update()` and `delete()`
aliases while retaining explicit `*Many` terminals for operations whose
cardinality, result, and database behavior differ.

## Target developer experience

```ts
const updated = await Post.query()
	.byId(post.id)
	.update({ set: { title: 'Updated' } }, { ultimabase })

const deleted = await Post.query().byId(post.id).delete({ ultimabase })
```

## Acceptance criteria

- [ ] `Query.update(input, options?)` delegates to `updateOne(input, options?)` without introducing another Operation AST kind or adapter path.
- [ ] `Query.delete(options?)` delegates to `deleteOne(options?)` without introducing another Operation AST kind or adapter path.
- [ ] Both aliases preserve the exact schema, selection, nullability, update-input, and result inference of their singular terminals.
- [ ] `create()` and `upsert()` remain the existing concise singular aliases.
- [ ] `createMany`, `updateMany`, `deleteMany`, and `upsertMany` remain explicit because they have collection or set-based semantics.
- [ ] Singular methods do not accept arrays and no `object | object[]` overload is introduced.
- [ ] Public JSDoc and Query documentation explain the concise-singular and explicit-collection naming rule.

## Tests

- [ ] Runtime tests prove that every alias produces and executes the exact same normalized operation as its `*One` counterpart.
- [ ] Compile-time tests prove exact update input, selection, nullability, and result inference.
- [ ] TypeScript language-service and packed-package tests verify autocomplete, documentation, and compact QuickInfo.

## Out of scope

- Removing the explicit `*One` methods.
- Adding `updateById`, `deleteById`, or other identifier-specific terminals.
- Overloading one method with both singular and collection inputs.
- Changing bulk atomicity or partial-success semantics.
