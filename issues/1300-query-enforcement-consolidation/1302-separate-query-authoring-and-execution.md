# 1302: Separate Query authoring from private execution

- Status: completed
- Milestone: 13
- Packages: `@ultimabase/core`
- Depends on: 1301
- ADR: ADR-0052, ADR-0058, ADR-0118, ADR-0132

## Goal

Separate the immutable public QueryBuilder and AST hydration from protected
object/relation scopes and operation execution while retaining one internal
bridge used by schema models, pointers, relations, and schema commands.

## Acceptance criteria

- [x] QueryBuilder state, immutable branching, projection building, and trusted AST hydration have focused Query-authoring ownership.
- [x] Object-identity and relation scopes have focused internal ownership outside the public and transformable Query AST.
- [x] Read and singular mutation operation construction plus execution have focused internal ownership separate from the public QueryBuilder class.
- [x] Schema models, pointers, relations, and schema commands reuse the canonical internal execution and scope modules instead of importing execution helpers from the public builder implementation.
- [x] `QueryBuilder` keeps its constructor, methods, `schema`, `ast`, immutability, exact selection/inclusion inference, autocomplete, and hovers.
- [x] Query and Operation ASTs retain no engine, request, authority, transaction, adapter, transport, or private scope state.
- [x] Pointer and relation scopes remain unforgeable from public input and cannot be inspected or removed by business hooks.
- [x] No new root export, Query terminal, public hydration method, operation kind, or compatibility layer is introduced.
- [x] Touched production assertion counts do not increase; remaining erased generic boundaries document the invariant they restore.

## Tests

- [x] Focused runtime and type tests protect immutable Query branches, AST identity, canonical object input, selection, inclusion, and private hydration.
- [x] Model, pointer, and relation tests protect object-ID and relation scopes across direct reads and mutations.
- [x] Schema command, Runtime, Access, hook, and transaction suites pass unchanged.
- [x] Source and packed language-service tests prove identical QueryBuilder inference and no internal execution or scope type leakage.

## Validation evidence

- `query/query/query.ts` decreases from 1,056 to 724 lines and retains only
  QueryBuilder state, immutable authoring, projection building, and trusted AST
  hydration. Protected scopes move to `private-scope.ts`; read and singular
  mutation operation construction and execution move to
  `operation-execution.ts`.
- Schema models, model commands, pointers, relations, and schema commands now
  import the focused internal owner for each responsibility. Core's public
  Query barrel remains unchanged and exposes none of the extracted names.
- A focused private-scope regression proves object identity remains outside the
  AST and survives trusted hydration plus subsequent immutable Query branches.
  Existing model, pointer, relation, and schema-command suites pass through the
  migrated bridge unchanged.
- The built Core `index.d.ts` SHA-256 remains exactly
  `95cdae76eeb73c73723669256bb308e1213fc31da8e7e93d028fcbba2a310ed8`
  before and after the extraction. Source negative imports and packed
  declaration checks prove hydration, scope, and execution internals do not
  leak publicly.
- Focused Query, private-scope, model, pointer, relation, and schema-command
  validation passes with 7 files and 41 tests. Repository unit and type suites
  pass with 288 files and 1,815 tests and no type errors.
- Packed-package validation passes with 7 files and 49 tests. Constraints,
  typecheck, lint, formatting, build, Changesets validation, and diff checks
  pass.
- Touched production files retain exactly 10 double assertions before and
  after the extraction. No `any`, deep import, public export, compatibility
  layer, or speculative extension is introduced.

## Out of scope

- Changing `WhereInput`, WhereBuilder, filtering operators, or Query AST nodes.
- Moving Query outside `@ultimabase/core`.
- Adding public Query execution or mutation methods.
- Refactoring Runtime Validation or hook boundaries.
