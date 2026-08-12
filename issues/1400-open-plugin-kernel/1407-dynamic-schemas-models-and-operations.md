# 1407: Add dynamic schemas, model extensions, and plugin operations

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1418
- ADR: ADR-0187, ADR-0188, ADR-0192, ADR-0193, ADR-0197

## Goal

Expose plugin-created dynamic schemas and let plugins declare model surfaces and
versioned operations without generating an executable client.

## Acceptance criteria

- [x] `ultimabase.schema(nameOrClass)` resolves one application-owned schema handle at runtime and receives exact literal typing when a generated registry exists.
- [x] Stable plugin schemas remain exportable ordinary schema classes; configuration-dependent schemas use the application handle.
- [x] Stable package methods may exist on package-owned classes; application-conditional schema commands, immutable model commands, operations, and query extensions live on schema and model handles without mutating exported classes or prototypes.
- [x] Model and query surfaces require distinct `model:extend` and `query:extend` privileges and cannot obtain Runtime interception implicitly.
- [x] Custom operations use one namespaced versioned envelope with validated immutable payload, target, result, and transaction metadata.
- [x] Stable operation tokens and dynamic names resolve one application operation handle shape without containing executable client state.
- [x] Operation declaration, Runtime handling, transport exposure, and serialization remain separate contributions.
- [x] Conflicting surfaces on one schema fail before setup within an application, while independent applications may reuse the class with isolated handle surfaces and no global mutation or compatibility registry.

## Tests

- [x] Runtime tests cover stable and dynamic schemas, schema and model handle binding, draft and persisted identity, operation validation, application disposal, isolation, conflicts, and JavaScript dynamic access.
- [x] Type tests establish descriptor precision and bootstrap behavior before final Typegen emission in issue 1408.

## Out of scope

- Typegen rendering; issue 1408 owns exact application declarations.
- Runtime execution and transport exposure of custom operations; issue 1416 owns them.
