# `@ultimabase/graphql-plugin` rebuild notes

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d` (branch base
`80fdb83`). The public contract is unchanged: every `src/index.ts` export, its
signature, generics, literal types and JSDoc; the `package.json` exports and
dependencies; the generated SDL (type names, type-map order, field order,
arguments, defaults, descriptions); resolvers, transactions and Core
attribution; error classes, codes, reasons, paths, owners, messages and GraphQL
`extensions`; request limits (document bytes, tokens/AST nodes, aliases, depth,
root fields, variables bytes, `@defer`/`@stream`/subscription rejection); cursor
integrity (HMAC, canonical base64url, scope and filter fingerprint binding);
plugin contribution ids, permissions and the public-protection report. Core is
consumed only through `@ultimabase/core` public exports, as before.

Note: `main` advanced (core query and runtime-pipeline merges) after this
branch was cut; every result below was obtained on the branch base `80fdb83`.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | graphql-plugin production lines |
| --------- | ------------------------------- |
| Before    | 7620                            |
| After     | 6661                            |
| Reduction | 959 lines (12.6%)               |

The remaining code is dominated by public interfaces and
JSDoc, explicit annotations required by `isolatedDeclarations`, and the
security checks (request limits, cursor verification, binding metadata
validation, composition ownership) whose evaluation order fixes which error a
multi-fault input reports; compressing those further would change behavior or
diagnostics. The count includes the three unchanged `*.test-support.ts` helpers (85 lines),
which the measurement script classifies as production.

## Design summary

54 production modules (including the three `*.test-support.ts` helpers) became 38. The main simplification is one shared
`GraphqlCompileContext` that replaces the name registry module, the compiled
schema lookup class and the per-compiler bookkeeping (`#types` arrays, `#claim`,
`#list`, `#pathName`, `materialize()` and `types` getters) that every compiler
re-implemented.

| New module                                                                                                                                                                    | Replaces                                                                              | Simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile-context.ts`                                                                                                                                                          | `names.ts`, `compiled-schema-lookup.ts`, `field-metadata.ts`, parts of every compiler | Name claims, field-name validation (one pattern instead of three identical ones), surface/target lookups, path-derived type names, description/enum/object-field readers, `nonNullList`, `memoize` and the ordered type lists. The lists (`models`, `connections`, `outputs`, `mutationInputs`, `rootInputs`, `bindings`, `filters`, `filterShared`, `structural`) are concatenated in the exact reference order, and `materialize()` forces them in the exact reference order, so type-map order and first-failure order are unchanged. |
| `field-compiler.ts`                                                                                                                                                           | `field-compiler.ts`, `field-codecs.ts`                                                | Model, enum, embedded object and embedded input caches use `memoize`; enum values are collected in a `Map`. Codec lookup lives next to its only users.                                                                                                                                                                                                                                                                                                                                                                                   |
| `output-type-compiler.ts`                                                                                                                                                     | `output-type-compiler.ts`, `connection-types.ts`                                      | Enum and object outputs share one name-keyed cache (keyed by kind, as the two former caches were). Relay `PageInfo`/edge/connection types moved here because they are output-only types too.                                                                                                                                                                                                                                                                                                                                             |
| `filter-input-compiler.ts`                                                                                                                                                    | `filter-input-compiler.ts`, `filter-capabilities.ts`                                  | Operator groups are object fragments (`equalityOperators`, `nullOperators`) instead of mutating helpers; key order is identical.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `filter-structural-input-compiler.ts`                                                                                                                                         | `filter-structural-input-compiler.ts`, `filter-shared-types.ts`                       | Shared read inputs (regex, JSON path, order direction) and the structural path/partial inputs share one class.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `mutation-input-compiler.ts`                                                                                                                                                  | same                                                                                  | The four root input caches and the three nested key families use `memoize` with suffix keys; `#create`/`#update` became one `#root(schema, mode, flat)`.                                                                                                                                                                                                                                                                                                                                                                                 |
| `root-fields.ts`                                                                                                                                                              | `read-input-compiler.ts`, `mutation-operation-compiler.ts`                            | Two functions over one `GraphqlRootCompilers` record instead of two classes with constructor plumbing. Argument types are still created for every surface, before the enabled check, exactly as before.                                                                                                                                                                                                                                                                                                                                  |
| `binding-metadata.ts`                                                                                                                                                         | `operation-metadata.ts`, `operation-schema-types.ts`                                  | Shared envelope validation for both binding families; `assertNonEmptyString` and `assertGraphqlKnownKeys` replace local copies with identical messages.                                                                                                                                                                                                                                                                                                                                                                                  |
| `binding-types.ts`                                                                                                                                                            | `binding-type-compiler.ts`                                                            | Built-in binding scalars are derived from the scalar table; input/output narrowing uses GraphQL type guards instead of two casts.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `binding-compiler.ts`                                                                                                                                                         | `operation-schema-compiler.ts`, `schema-mutation-schema-compiler.ts`                  | One function registers both binding families in the reference order, finalizes the type graph and returns the root-adding step.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `compiler.ts`                                                                                                                                                                 | same                                                                                  | Orchestration only; reserved names come from the scalar table plus `Query`/`Mutation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `wire-values.ts`                                                                                                                                                              | `read-values.ts`, `nested-mutation-values.ts`                                         | Operator decoding is table-driven (`contains`/`containedBy` already reduced to `decodeElement`).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `read-normalization.ts`                                                                                                                                                       | `read-normalization.ts`, `read-ordering.ts`                                           | One contract table (Core kind and accepted arguments) per read. `normalizeGraphqlCollectionArguments` moved to `selection-normalization.ts` and is re-exported here.                                                                                                                                                                                                                                                                                                                                                                     |
| `selection-normalization.ts`                                                                                                                                                  | same                                                                                  | Takes the connection runtime instead of a normalizer callback that three callers wrote identically; the runtime and relationship mode travel in the selection context.                                                                                                                                                                                                                                                                                                                                                                   |
| `mutation-normalization.ts`                                                                                                                                                   | same                                                                                  | Typed input decoders (`decodeWhereKey`, `decodeUpsert`, `decodeBulkItem`) remove one cast.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `connection-runtime.ts`                                                                                                                                                       | `connection-runtime.ts`, `cursor-codec.ts`, `connection-fingerprint.ts`               | The HMAC key and cursor encode/decode are private members of the runtime. Page plans are frozen opaque tokens whose state stays in a module `WeakMap`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `networkless-execution.ts`                                                                                                                                                    | `networkless-execution.ts`, `document-limits.ts`                                      | One `requestFailure` factory; the JSON variable check is a predicate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `schema-composition.ts`                                                                                                                                                       | `schema-composition.ts`, `schema-resolver-attribution.ts`                             | Three async wrappers became one generic `#resolver(callback, source, contextIndex)`, three scalar wrappers one `#scalarCallback`. Kind-specific `toConfig()` access uses type guards instead of eight casts.                                                                                                                                                                                                                                                                                                                             |
| `schema-composition-preflight.ts`                                                                                                                                             | `schema-composition-preflight.ts`, `schema-composition-types.ts`                      | Member uniqueness is table-driven by kind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `application.ts`                                                                                                                                                              | same                                                                                  | One `liveState` accessor; the resource receives one state record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `operation-execution.ts`, `schema-mutation-execution.ts`                                                                                                                      | same                                                                                  | Private fields replace module `WeakMap` states (disposal clears them); one shared `matchesGraphqlPlan`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `plugin.ts`, `options.ts`, `surfaces.ts`, `scalars.ts`, `scalar-types.ts`, `connection-limits.ts`, `execution-errors.ts`, `generated-execution.ts`, `schema-contributions.ts` | same                                                                                  | Redundant annotations on private constants removed; option flag snapshots share one interleaved key/value walk; surface flags and operation resolution share one resolver; `SafeInt`/`BigInt`/`Base64` parsers deduplicated; limit keys derived from the defaults; one closed-key helper (`assertGraphqlKnownKeys`) replaces seven loops with the same messages.                                                                                                                                                                         |

Unchanged: `index.ts`, `protocol.ts`, `errors.ts`, `connection-errors.ts` and the
three `*.test-support.ts` helpers.

### Casts

The rebuild adds no cast. Six reference casts remain, moved unchanged: the two
untyped Core option reads (`fields as SchemaFields`, `fields as OutputFields`),
`readGraphqlSchemaExposure`, the two generic Core AST results
(`GraphqlReadOperationAst`, `GraphqlMutationCommand`) and the numeric step
operand in `wire-values.ts`. Thirteen reference casts were removed: nine in
composition (three generic `as TType` and six kind-specific `toConfig()`
casts), two in binding types, the duplicated `SchemaFields` cast of structural
filters and the `mutationInput` record cast in mutation normalization.

## Checks removed as unreachable (with proof)

- `GraphqlBindingTypeCompiler` "already finalized" / "not finalized" guards:
  the binding type graph is private to `compileGraphqlBindings`, which registers
  every binding, finalizes once, and only then returns the closure that calls
  `inputType`/`outputType`.
- `GraphqlCursorCodec` "has been disposed" checks: the codec no longer exists;
  every encode/decode is reached through `prepare`/`page`, which first throw
  `GraphQL connection runtime has been disposed` (still asserted by
  `src/connection-runtime.test.ts`).
- `try/catch` around `Buffer.from(segment, 'base64url')` in cursor decoding:
  Node never throws for string input there; the canonical round-trip check that
  follows is kept.
- `GraphqlSchemaCompilationError` reason fallback `|| queryFields === 0` after
  `validateSchema`, and the `@subscription` root slot: composition throws
  `missing-query-root` for an empty query root before validation, and preflight
  throws `unsupported-feature` for any source with a subscription root before
  roots are collected.
- `GraphQL schema contribution must be an array`: the value is always wrapped
  into an array first.
- Structural partial inputs used their own `Missing object fields for …` check
  before reading object children; they now use the shared
  `readGraphqlObjectFields` (message `Compiled object field must retain child
fields`). Both run only for Core `object` fields, whose `fields` option Core
  validates as a plain field map (`packages/core/src/schema/fields/builtins/object.ts`,
  `fields must be a field map`), and plugin field kinds must be namespaced, so
  they can never be `object`.
- Dead code: `GraphqlConnectionRuntime.defaultPageSize`/`maxPageSize` getters,
  `GraphqlMutationOperationCompiler.mutationType()` and the
  `GraphqlFieldTypeCompiler.createFields` public entry (only used internally).

## Test mapping

No test file was modified: nothing under `packages/graphql-plugin/tests/**`, no
`*.test-d.ts`, no `src/**/*.test.ts`, no `*.test-support.ts`, and no test outside
the package. Every module the tests deep-import keeps its path and export:
`application.ts` (`readGraphqlConnectionRuntime`), `connection-errors.ts`,
`connection-limits.ts`, `connection-runtime.ts` (`GraphqlConnectionRuntime`
constructor, `prepare`, `page`, `dispose`), `execution-errors.ts`,
`generated-execution.ts`, `operation-execution.ts`, `schema-mutation-execution.ts`,
`mutation-normalization.ts`, `options.ts`, `surfaces.ts` (`resolveGraphql*`),
`scalars.ts`, `scalar-types.ts`, `schema-composition.ts`,
`schema-contributions.ts`, `read-normalization.ts`
(`normalizeGraphqlCollectionArguments`, `prepareGraphqlReadOperation` and its
types), `plugin.ts`, `protocol.ts`, `index.ts`.

### Parity oracle

Besides the suites, a temporary hook (never committed) appended, for every
application compiled by `yarn vitest run --project unit --project types
packages/graphql-plugin`, the unsorted `printSchema` of the generated and of the
composed schema, or the compilation error (`name`, `message`, `reason`, `path`,
`owner`). Unsorted SDL fixes the type-map order and every field and argument
order. The reference dump (85 entries, 23 of them compilation errors) and the
rebuild dump are byte-identical after sorting lines; the comparison was rerun
after each checkpoint.

## Reference bug found (documented, not reproduced)

`normalizeGraphqlOrdering` accumulated `orderBy` entries with
`order[item.field] = direction`. A field literally named `__proto__` would set
the object's prototype (to a string, which is ignored) and silently drop the
entry instead of letting Core reject it. The rebuild accumulates entries in a
`Map` and builds the record with `Object.fromEntries`, so such a key stays an
own key and Core's read normalization rejects it as an unknown field. This is
not observable through GraphQL: `orderBy.field` is an enum of persisted field
names, GraphQL rejects enum values starting with `__`, and every persisted
field name is checked by `assertSchemaFieldName` when the `Where` input is
materialized. It is therefore not listed in `docs/rebuild/DIFFERENCES.md`.

## Behavior differences

None observable through the public API, the generated schema or the suites.

## Pre-existing failures (untouched tree, same machine)

Baseline after `yarn build` on the branch base:

- `yarn vitest run --project unit --project types packages/graphql-plugin`:
  22 files / 125 tests passed.
- `--project e2e packages/graphql-plugin`: 1 / 1 passed;
  `--project postgres-e2e packages/graphql-plugin`: 3 files / 5 tests passed.
- Consumers (`graphql-yoga-plugin`, `create-app`, `password-auth-plugin`):
  unit+types 30 files / 150 tests passed; postgres-e2e 8 / 40 passed; e2e 1
  failed of 9 (`create-app-packed.e2e.test.ts` 120 s timeout, known flaky).
- `yarn vitest run --project e2e tests/e2e`: 47 files / 219 tests passed.
- `yarn vitest run --project postgres-e2e tests/e2e`: 54 files / 190 tests
  passed; the 55th file (`packages/graphql-plugin/tests/e2e/graphql-relay-postgres`,
  matched by the `tests/e2e` filter) failed to import only because the rewrite
  had started editing `src` while that run was in flight; it passed in the
  dedicated package baseline run above.

## Validation (final tree)

All commands were run in the worktree, in this order, after the last code
change (`yarn tsc --build` rewrites referenced `dist` declarations, so
`yarn build` was run again afterwards).

| Command                                                                                                                         | Result                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                                                                    | pass                                                                                                                                                             |
| `yarn vitest run --project unit --project types packages/graphql-plugin`                                                        | 22 files, 125 tests passed                                                                                                                                       |
| `yarn vitest run --project e2e packages/graphql-plugin`                                                                         | 1 file, 1 test passed                                                                                                                                            |
| `yarn vitest run --project postgres-e2e packages/graphql-plugin`                                                                | 3 files, 5 tests passed                                                                                                                                          |
| `yarn vitest run --project unit --project types packages/graphql-yoga-plugin packages/create-app packages/password-auth-plugin` | 30 files, 150 tests passed                                                                                                                                       |
| `yarn vitest run --project e2e packages/graphql-yoga-plugin packages/create-app packages/password-auth-plugin`                  | 4 files, 9 tests passed                                                                                                                                          |
| `yarn vitest run --project postgres-e2e packages/graphql-yoga-plugin packages/create-app packages/password-auth-plugin`         | 8 files, 40 tests passed                                                                                                                                         |
| `yarn vitest run --project e2e tests/e2e`                                                                                       | 46 of 47 files, 218 of 219 tests passed; `create-app-packed.e2e.test.ts` timed out (120 s, known flaky under load) and passed when rerun alone (1 file, 6 tests) |
| `yarn vitest run --project postgres-e2e tests/e2e`                                                                              | 55 files, 191 tests passed                                                                                                                                       |
| `yarn test:pack:built`                                                                                                          | 32 files, 173 tests passed                                                                                                                                       |
| `yarn eslint packages/graphql-plugin`                                                                                           | 0 errors, 0 warnings                                                                                                                                             |
| `yarn prettier --check packages/graphql-plugin`                                                                                 | pass                                                                                                                                                             |
| `yarn tsc --build packages/graphql-plugin`                                                                                      | pass                                                                                                                                                             |
| `yarn tsc -p packages/graphql-plugin/tsconfig.test.json`                                                                        | pass                                                                                                                                                             |
| `yarn build` (again)                                                                                                            | pass                                                                                                                                                             |
| `node tooling/measure-rebuild.mjs .`                                                                                            | graphql-plugin 7620 → 6661                                                                                                                                       |

Consumers were found with `git grep -l "@ultimabase/graphql-plugin" -- packages
tests examples apps`. `examples/minimal` and `apps/website` have no suite of
their own (the example is exercised by `tests/e2e`); the `tests/e2e` files that
mention the plugin ran in the two `tests/e2e` runs above.
