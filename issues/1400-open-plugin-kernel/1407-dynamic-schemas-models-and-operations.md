# 1407: Add dynamic schemas, model extensions, and plugin operations

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1406
- ADR: ADR-0187, ADR-0188, ADR-0192, ADR-0193

## Goal

Expose plugin-created dynamic schemas and let plugins declare model surfaces and
versioned operations without generating an executable client.

## Acceptance criteria

- [ ] `ultimabase.schema(nameOrClass)` resolves one application-owned schema handle at runtime and receives exact literal typing when a generated registry exists.
- [ ] Stable plugin schemas remain exportable ordinary schema classes; configuration-dependent schemas use the application handle.
- [ ] Stable package methods may exist on package-owned classes; application-conditional schema commands, immutable model commands, operations, and query extensions live on schema and model handles without mutating exported classes or prototypes.
- [ ] Model and query surfaces require distinct `model:extend` and `query:extend` privileges and cannot obtain Runtime interception implicitly.
- [ ] Custom operations use one namespaced versioned envelope with validated immutable payload, target, result, and transaction metadata.
- [ ] Stable operation tokens and dynamic names resolve one application operation handle shape without containing executable client state.
- [ ] Operation declaration, Runtime handling, transport exposure, and serialization remain separate contributions.
- [ ] Reusing one schema class with incompatible plugin-added methods or operations fails before setup instead of mutating a shared class globally.

## Tests

- [ ] Runtime tests cover stable and dynamic schemas, schema and model handle binding, draft and persisted identity, operation validation, application disposal, isolation, conflicts, and JavaScript dynamic access.
- [ ] Type tests establish descriptor precision and bootstrap behavior before final Typegen emission in issue 1408.

## Out of scope

- Typegen rendering; issue 1408 owns exact application declarations.
- Runtime execution and transport exposure of custom operations; issue 1416 owns them.
