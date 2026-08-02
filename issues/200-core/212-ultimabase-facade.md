# 212: Introduce the UltimaBase public facade

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`, `@ultimabase/runtime`
- Depends on: 209, 323
- ADR: ADR-0005, ADR-0050, ADR-0076, ADR-0093, ADR-0094

## Goal

Make `new UltimaBase(options)` the normal class-based entry point for declaring,
starting, querying, stopping, and disposing one isolated application.

## Target developer experience

```ts
const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [postgresPlugin()],
})

await ultimabase.start()

const posts = await ultimabase.query(PostSchema).find()
```

## Acceptance criteria

- [x] `UltimaBase` is the documented public facade and preserves exact schema and plugin inference from its constructor options.
- [x] Construction performs no infrastructure I/O; `start()` initializes the application, runtime engine, and plugin lifecycle exactly once.
- [x] `query(schema)` uses the application-owned `RequestEngine` and rejects schemas owned by another `UltimaBase` instance.
- [x] `stop()` and disposal preserve deterministic plugin teardown and permanently close escaped engines and queries.
- [x] The relationship between `UltimaBase`, `FrameworkApplication`, `createApplication`, and `createFrameworkEngine` is settled in a refining ADR before exports change.
- [x] `FrameworkApplication` may remain an advanced internal composition object, but it is not the primary developer-facing name.
- [x] Core and Runtime retain their infrastructure-neutral dependency boundaries.
- [x] The constructor, options, lifecycle methods, and query boundary provide concise English JSDoc, autocomplete, and compact hovers.
- [x] Root and package documentation use `const ultimabase = new UltimaBase(...)` as the canonical bootstrap example.

## Tests

- [x] Runtime tests cover construction, start, query, stop, disposal, repeated lifecycle calls, and failure cleanup.
- [x] Two `UltimaBase` instances run concurrently without schema, service, plugin, or request-context leakage.
- [x] Compile-time and language-service tests cover schema/plugin inference, invalid options, autocomplete, and QuickInfo.
- [x] Packed-package E2E tests prove the documented facade through public declarations.

## Out of scope

- Persisted Active Record methods.
- Concrete database, transport, authentication, or migration behavior in Core.
- A global application singleton.
