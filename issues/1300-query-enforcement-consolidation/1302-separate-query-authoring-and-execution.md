# 1302: Separate Query authoring from private execution

- Status: planned
- Milestone: 13
- Packages: `@ultimabase/core`
- Depends on: 1301
- ADR: ADR-0052, ADR-0058, ADR-0118, ADR-0132

## Goal

Separate the immutable public QueryBuilder and AST hydration from protected
object/relation scopes and operation execution while retaining one internal
bridge used by schema models, pointers, relations, and schema commands.

## Acceptance criteria

- [ ] QueryBuilder state, immutable branching, projection building, and trusted AST hydration have focused Query-authoring ownership.
- [ ] Object-identity and relation scopes have focused internal ownership outside the public and transformable Query AST.
- [ ] Read and singular mutation operation construction plus execution have focused internal ownership separate from the public QueryBuilder class.
- [ ] Schema models, pointers, relations, and schema commands reuse the canonical internal execution and scope modules instead of importing execution helpers from the public builder implementation.
- [ ] `QueryBuilder` keeps its constructor, methods, `schema`, `ast`, immutability, exact selection/inclusion inference, autocomplete, and hovers.
- [ ] Query and Operation ASTs retain no engine, request, authority, transaction, adapter, transport, or private scope state.
- [ ] Pointer and relation scopes remain unforgeable from public input and cannot be inspected or removed by business hooks.
- [ ] No new root export, Query terminal, public hydration method, operation kind, or compatibility layer is introduced.
- [ ] Touched production assertion counts do not increase; remaining erased generic boundaries document the invariant they restore.

## Tests

- [ ] Focused runtime and type tests protect immutable Query branches, AST identity, canonical object input, selection, inclusion, and private hydration.
- [ ] Model, pointer, and relation tests protect object-ID and relation scopes across direct reads and mutations.
- [ ] Schema command, Runtime, Access, hook, and transaction suites pass unchanged.
- [ ] Source and packed language-service tests prove identical QueryBuilder inference and no internal execution or scope type leakage.

## Out of scope

- Changing `WhereInput`, WhereBuilder, filtering operators, or Query AST nodes.
- Moving Query outside `@ultimabase/core`.
- Adding public Query execution or mutation methods.
- Refactoring Runtime Validation or hook boundaries.
