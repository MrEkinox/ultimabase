# 339: Define constructible schema model classes

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 143, 306, 331
- ADR: ADR-0005, ADR-0019, ADR-0052, ADR-0067, ADR-0109

## Goal

Replace separate schema values and generic result wrappers with one
schema-specific class produced by `Schema.define()`, constructible as a typed
draft and used as the immutable Runtime result identity.

## Target developer experience

```ts
export const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({
			validation: { required: true },
		}),
	},
})

const ultimabase = new UltimaBase({
	schemas: [Post],
})

const draft = new Post({ title: 'Hello' })
const query = Post.query().select('id', 'title')
```

## Acceptance criteria

- [ ] `Schema.define(options)` is the only public schema declaration path and preserves exact class name, fields, indexes, hooks, extensions, and option inference.
- [ ] The returned value is a constructible schema-specific class with immutable static `definition`, `className`, and `fields` metadata.
- [ ] Application registries, Query, hooks, extensions, plugins, validation plans, and adapters accept the class while infrastructure consumes only its neutral static definition.
- [ ] Exact class identity preserves application isolation and rejects copied, structurally similar, or cross-application schema classes.
- [ ] `Post.query()` returns a fresh immutable `new Query(Post)` branch without retaining execution state or mirroring Query builder methods.
- [ ] `new Post(createInput)` creates an immutable draft with exact create input, direct property, `get(field)`, and `toJSON()` typing and performs no I/O.
- [ ] Runtime materializes Query and mutation results as the exact schema class only after hooks, output restrictions, and selection narrowing.
- [ ] Selected and dynamically restricted results never expose omitted values through direct properties, `get`, iteration, inspection, or serialization.
- [ ] Draft and persisted instance states are distinguishable without expanding complete field definitions in ordinary hovers.
- [ ] `new Schema(options)` is removed instead of retained as a second declaration API.
- [ ] Decorators, generated source files, implicit subclass extension, and a constructor returning another constructor are not introduced.
- [ ] Public JSDoc explains declaration, registration, construction, static Query access, immutable results, and state distinctions.

## Tests

- [ ] Runtime tests cover declaration validation, static metadata, immutable drafts, exact class materialization, selection, output restriction, application identity, and JavaScript misuse.
- [ ] Compile-time tests cover create inputs, system fields, direct values, `get`, `toJSON`, nested objects, lists, custom fields, draft and persisted states, and invalid fields.
- [ ] Query tests prove `Post.query()` and `new Query(Post)` create equivalent independent AST branches.
- [ ] TypeScript language-service tests verify declaration and instance autocomplete, option documentation, named class hovers, and compact method signatures.
- [ ] Packed-package tests prove the same constructor, Query, and result inference through public exports.
- [ ] PostgreSQL E2E tests prove plain adapter records become exact schema-class instances only at the Runtime output boundary.

## Out of scope

- Instance persistence commands, owned by issue 349.
- Mutable dirty tracking or implicit write batching.
- Schema subclassing as a plugin or extension mechanism.
- Transport-specific response wrappers.
