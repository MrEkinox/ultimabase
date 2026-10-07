# postgres-plugin rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

The public contract is unchanged: every `src/index.ts` export, its
signatures, generics, literal types and public JSDoc, the generated SQL and
DDL, result ordering, transactions and rollback, prepared-mutation semantics,
error classes, codes, messages and internal details, identifier quoting and
connection lifecycle. The emitted `dist/index.d.ts` is byte-identical to the
one built from the untouched package sources (the coordinator checkout of
`main`). Core is consumed only through
`@ultimabase/core` public exports, as before.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|        | Lines          |
| ------ | -------------- |
| Before | 9307           |
| After  | 7966           |
| Delta  | -1341 (-14.4%) |

Production files: 61 before, 47 after. The measured total includes the
unchanged `*.test-support.ts` and `*.test-fixture.ts` helpers (about 250
lines), which the measurement script classifies as production.

## Design summary

Two cross-cutting simplifications drive most of the reduction:

- `required.ts` is one internal invariant helper, `required(value, message)`,
  replacing about fifty `if (x === undefined) throw new TypeError(message)`
  blocks. Every message is unchanged.
- `PostgresStatementContext` (`client`, `schema`, `relationCompiler`) replaces
  the five to seven positional parameters that were threaded through every
  executor and prepared-mutation helper.

Module mapping:

| New module                                  | Replaces                                                                                                                     | Simplification                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `naming.ts`                                 | `naming/identifier.ts`, `naming/index.ts`, `naming/foreign-key.ts`, `naming/relation.ts`                                     | One module; UTF-8 truncation is an inline loop.                                                                                                                                                                                                                                                                                                                                                                          |
| `required.ts`                               | (new)                                                                                                                        | See above.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `options.ts`                                | same                                                                                                                         | Both option namespaces share `readSingleStringOption`. Reading normalized options uses a runtime guard instead of two `Reflect.get(...) as` casts.                                                                                                                                                                                                                                                                       |
| `adapter-capabilities.ts`                   | same                                                                                                                         | Column-type allow-list is a `Set`.                                                                                                                                                                                                                                                                                                                                                                                       |
| `connection/managed-connection.ts`          | same                                                                                                                         | One sanitized error factory for the connection and disposal phases. The class (private fields, prototype methods, `Symbol.asyncDispose`) is kept so the exported connection object keeps its exact shape.                                                                                                                                                                                                                |
| `constraints/definition.ts`                 | same                                                                                                                         | Opaque predicate handles share one factory; `anyOf` and the final predicate lookup use `required`; the unused exported `getPostgresConstraintCompilerImplementation` was inlined.                                                                                                                                                                                                                                        |
| `schema/contracts.ts`                       | `schema/contracts.ts`, `schema/field.ts`                                                                                     | Field resolution lives beside the compiled types; selections are built with `Object.fromEntries`.                                                                                                                                                                                                                                                                                                                        |
| `schema/field-compiler.ts`                  | same                                                                                                                         | The 13-case switch became a `Map` of native column specifications. Static-default validation, identity generation and nullability/primary-key finalization are shared; options are read once.                                                                                                                                                                                                                            |
| `schema/value-codec.ts`                     | same                                                                                                                         | The `jsonb` flag was always `true`, so the unreachable non-JSONB branches (native temporal codec, native binary codec, plugin-codec rejection) were removed. Nullability is applied by one wrapper; arrays and objects no longer re-apply it per item.                                                                                                                                                                   |
| `schema/index-compiler.ts`                  | `schema/index-compiler.ts`, `schema/drizzle-table-metadata.ts`                                                               | Index compilation and Drizzle index metadata readers in one module. Storage kinds are passed as a `Map`.                                                                                                                                                                                                                                                                                                                 |
| `schema/schema-compiler.ts`                 | same                                                                                                                         | Pointer referential actions are a `Map`; pointer constraints are built inline; four record-building `as` casts are gone.                                                                                                                                                                                                                                                                                                 |
| `schema/relation-compiler.ts`               | same                                                                                                                         | One `oriented` builder for the three storage orientations; the owning join of an inverse relation is found in the compiled join list.                                                                                                                                                                                                                                                                                    |
| `schema/drizzle-relations.ts`               | same                                                                                                                         | Generated RQB relation configuration lives in `Map`s converted with `Object.fromEntries`, so declared field names never reach a prototype-assignment pattern. One factory handles `one`/`many` relations.                                                                                                                                                                                                                |
| `schema/catalog.ts`                         | same                                                                                                                         | Relation and pointer lookups search the compiled arrays (last registration wins, as with the former keyed maps). Lookups use `required`.                                                                                                                                                                                                                                                                                 |
| `private-storage/compiler.ts`               | `private-storage/compiler.ts`, `private-storage/contracts.ts`                                                                | The collection type lives with its compiler; two `as` casts are gone.                                                                                                                                                                                                                                                                                                                                                    |
| `private-storage/executor.ts`               | same                                                                                                                         | One row/`null` mapping for the five request kinds.                                                                                                                                                                                                                                                                                                                                                                       |
| `query/filter-compiler.ts`                  | `query/filter-compiler.ts`, `query/filter-contracts.ts`                                                                      | The schema-erased leaf union is declared once beside its compiler; equality, membership, list, key and range branches share small helpers. SQL text is unchanged.                                                                                                                                                                                                                                                        |
| `query/jsonb-operand.ts`                    | `query/jsonb-parameter.ts`, `query/plugin-field-containment-compiler.ts`                                                     | JSONB parameter serialization and plugin containment operands in one module.                                                                                                                                                                                                                                                                                                                                             |
| `query/clause-compiler.ts`                  | same                                                                                                                         | Accepts Core's schema-erased `QueryAst` and compiles `where` through the row-filter entry point, which removed the `readBuiltInQuery` cast. `selectPostgresFieldNames` is shared with relational reads.                                                                                                                                                                                                                  |
| `query/relation-compiler.ts`                | `query/relation-compiler.ts`, `query/drizzle-relation-filter.ts`                                                             | The RQB relation-filter helper lives with its only callers' module.                                                                                                                                                                                                                                                                                                                                                      |
| `query/relation-predicate-compiler.ts`      | same                                                                                                                         | Target policy compilation is shared by the count and quantified branches; pointer and join count aggregates share one statement; related-target resolution is a named helper.                                                                                                                                                                                                                                            |
| `drizzle/operation-error.ts`                | `drizzle/operation-error.ts`, `drizzle/transaction-error.ts`                                                                 | Both driver-error mappings in one module.                                                                                                                                                                                                                                                                                                                                                                                |
| `drizzle/record.ts`                         | `drizzle/record.ts`, `drizzle/result-projection.ts`                                                                          | Records and projections are built with `Object.fromEntries`.                                                                                                                                                                                                                                                                                                                                                             |
| `drizzle/update-compiler.ts`                | same                                                                                                                         | Flat validation; entries collected then frozen.                                                                                                                                                                                                                                                                                                                                                                          |
| `drizzle/relation-executor.ts`              | `drizzle/relation-executor.ts`, `drizzle/scoped-relation-mutation.ts`                                                        | Delta validation returns target ids directly.                                                                                                                                                                                                                                                                                                                                                                            |
| `drizzle/persistence-plan.ts`               | same                                                                                                                         | Delete rewrites share one branch.                                                                                                                                                                                                                                                                                                                                                                                        |
| `drizzle/operation-executor.ts`             | `drizzle/operation-executor.ts`, part of `drizzle/prepared-persistence.ts`                                                   | Uses `PostgresStatementContext`; count/exists/targeted writes share `selectTargetIds`; both lock variants share `lockTargets`; retained-update helpers moved here.                                                                                                                                                                                                                                                       |
| `drizzle/prepared-operation.ts`             | `prepared-operation.ts`, `prepared-operation-execution.ts`, `prepared-mutation-handle.ts`, rest of `prepared-persistence.ts` | One preparation switch returns `{ target?, targets?, execute }`; one handle wraps it. Outcomes are built by `itemOutcome`/`itemsOutcome`. Six reference casts (`readPlan(...) as`, `plan as unknown as`, `compileConstraint as unknown as`, `physicalOperation as unknown as`, outcome `as unknown as`, `prepared as PreparedDatabaseOperation`) were replaced by a kind type guard; only the final handle cast remains. |
| `drizzle/relational-query-executor.ts`      | same                                                                                                                         | Inclusion branches are resolved once per request into a read-plan tree reused by config compilation and decoding (previously re-resolved for every decoded record). The `query as unknown as QueryAst` cast is gone.                                                                                                                                                                                                     |
| `drizzle/adapter.ts`                        | same                                                                                                                         | Both adapter lifetimes share one execution context and an abstract record-reader base class; INSERT-path constraint rejection and constraint compilation are shared by `execute`, `prepare` and prepared re-compilation.                                                                                                                                                                                                 |
| `introspection/introspector.ts`             | same                                                                                                                         | The three catalog passes are inline loops sharing one `reject` helper; identity and foreign-key action codes are `Map`s. Catalog SQL is byte-identical.                                                                                                                                                                                                                                                                  |
| `synchronization/planner.ts`                | same                                                                                                                         | Foreign-key drop/add, index and primary-key planning are compacted; change order is unchanged.                                                                                                                                                                                                                                                                                                                           |
| `synchronization/sql-renderer.ts`           | same                                                                                                                         | `ALTER TABLE`/`ALTER COLUMN` prefixes are shared.                                                                                                                                                                                                                                                                                                                                                                        |
| `synchronization/desired-schema.ts`         | same                                                                                                                         | One table compiler; foreign-key actions are a `Map`.                                                                                                                                                                                                                                                                                                                                                                     |
| `synchronization/physical-contributions.ts` | same                                                                                                                         | Shared error details.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `synchronization/preparer.ts`               | same                                                                                                                         | One rejection helper for drift and unsupported structures.                                                                                                                                                                                                                                                                                                                                                               |
| `plugin/postgres-plugin.ts`                 | same                                                                                                                         | The validated options object is captured directly instead of through a connection-source factory; policy validation uses a `Set`.                                                                                                                                                                                                                                                                                        |

Unchanged modules: `index.ts`, `constants.ts`, `connection/contracts.ts`,
`connection/driver-error.ts`, `connection/query-result.ts`,
`constraints/compiler.ts`, `drizzle/client.ts`, `drizzle/codecs.ts`,
`introspection/contracts.ts`, `synchronization/contracts.ts` and all
`*.test-support.ts` / `*.test-fixture.ts` helpers.

### `as` casts

The reference had 43 production `as` casts (an `as unknown as` chain counts
once); the rebuild has 21, each one a reference cast kept at the same
boundary. No cast is new. Removed: `readBuiltInQuery`, the relational
`query as unknown as QueryAst`, the two `options.ts` option reads, the eight
`Object.fromEntries(...) as Record<...>` casts (schema compiler, value codec,
private storage, alias rebinding), the private index-tuple cast, the
`items as readonly RuntimeUpsertItem[]` cast, one of the two duplicated
predicate-handle casts, one of the two adapter result casts, and the six
prepared-mutation casts listed above. Kept (moved): the constraint brand
handles and callback erasure (`constraints/definition.ts`), the
result-correlation casts in `adapter.ts` and `operation-executor.ts`,
`client as NodePgClient`, the persistence-plan rebuild, the final prepared
handle, Drizzle's `RAW` filters and `SchemaEntry as PgTable` boundaries, the
dynamic RQB query builder, the two `filter-compiler.ts` schema erasures and
the `ManyFn`/`OneFn` factory calls.

## Test mapping

Nothing under `packages/postgres-plugin/tests/**`, no `*.test-d.ts`, no
`*.test-support.ts` / `*.test-fixture.ts` helper and no test outside the
package changed. Every path deep-imported by `tests/` was kept
(`options.js`, `constraints/compiler.js`, `constraints/definition.js`,
`drizzle/adapter.js`, `query/filter-compiler.js`,
`query/relation-predicate-compiler.js`, `schema/catalog.js` and the fixtures).

Internal `src/**/*.test.ts` files changed only their import specifier; inputs,
assertions and expectations are byte-identical:

| Test file                        | Change                              |
| -------------------------------- | ----------------------------------- |
| `src/naming/foreign-key.test.ts` | `./foreign-key.js` → `../naming.js` |
| `src/naming/index.test.ts`       | `./index.js` → `../naming.js`       |
| `src/naming/relation.test.ts`    | `./relation.js` → `../naming.js`    |

## Reference bugs found (documented, not reproduced)

- **`__proto__` field names reach prototype assignment.** Core accepts
  `__proto__` as a field name (it keeps it as an own key). The reference
  PostgreSQL adapter then wrote field-keyed objects with assignment
  (`selection[field] = …` in `compilePostgresSelection`, `copied[field] = …`
  in record copies, `compiled[field] = …` in the update compiler,
  `projection[field] = …` in projections, `sourceConfig[field] = …` in the
  generated Drizzle relation config). For a field named `__proto__` these
  writes set the object's prototype instead of an own key, so the field was
  silently dropped from the built object. The
  rebuild builds every such object with `Object.fromEntries` or a `Map`, so
  the key stays an ordinary own key. No test covers this input; reproducing
  the reference would require deliberately prototype-polluting code.
- **Catalog code lookups on plain objects.** The reference read PostgreSQL
  foreign-key action codes through a plain object, so an inherited key such as
  `constructor` would have produced a function instead of an error. PostgreSQL
  only returns `a`, `r`, `c`, `n` or `d`; the rebuild uses a `Map` and keeps
  the `Unknown PostgreSQL foreign-key action` error for anything else.

## Behaviour differences

None on any reachable path. Unreachable-path hardening, each failing with a
`TypeError` where the reference relied on a cast:

- A prepared handle whose resolved operation changed its kind family now fails
  with `PostgreSQL prepared mutation changed its operation kind`. Runtime
  always resolves the same logical kind (`readPostgresPreparedOperation`
  already rejects a changed persistence kind).
- `preparePostgresMutation` rejects a non-mutation operation with
  `PostgreSQL prepared operation must be a mutation`; its type parameter
  already restricts it to mutation ASTs.

## Pre-existing failures (untouched tree)

None. See the baseline column below.

## Validation commands and results

Run in the worktree on the shared machine. "Consumers" are the packages
found by `git grep -l "@ultimabase/postgres-plugin" -- packages tests examples apps`
that have Vitest projects: `access-plugin`, `acl-permissions-plugin`, `core`,
`create-app`, `graphql-plugin`, `graphql-yoga-plugin`, `hooks-plugin`,
`password-auth-plugin`, `pg-vector-plugin`, `rest-plugin`, `roles-plugin`,
`server-hono-plugin`, `soft-delete-plugin`, `typegen` and `validation-plugin`
(the `examples/*` and `apps/website` matches are documentation, generated
declarations or package manifests outside the unit/e2e projects). The
consumer e2e runs also pass the `tests/e2e` filter, which as a substring
filter selects every `*/tests/e2e/**` file, so they are the complete `e2e`
and `postgres-e2e` projects.

| Command                                                                    | Baseline (untouched tree)           | Rebuilt                                                       |
| -------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `yarn build`                                                               | pass                                | pass                                                          |
| `yarn vitest run --project unit --project types packages/postgres-plugin`  | 45 files, 169 tests, no type errors | 45 files, 169 tests, no type errors                           |
| `yarn vitest run --project e2e packages/postgres-plugin`                   | 1 file, 7 tests                     | 1 file, 7 tests                                               |
| `yarn vitest run --project postgres-e2e packages/postgres-plugin`          | 4 files, 7 tests                    | 4 files, 7 tests                                              |
| `yarn vitest run --project unit <consumers>`                               | 364 files, 2034 tests               | 364 files, 2034 tests                                         |
| `yarn vitest run --project postgres-e2e <consumers> tests/e2e`             | 55 files, 191 tests                 | 55 files, 191 tests                                           |
| `yarn vitest run --project e2e <consumers> tests/e2e`                      | 47 files, 219 tests                 | 47 files, 219 tests                                           |
| `yarn test:pack:built` (includes `postgres-direct-options` archive audits) | not run                             | 32 files, 173 tests                                           |
| `yarn eslint packages/postgres-plugin`                                     | not run                             | 0 errors, 4 `max-lines` warnings (1)                          |
| `yarn prettier --check packages/postgres-plugin`                           | not run                             | pass                                                          |
| `yarn tsc --build packages/postgres-plugin`                                | not run                             | pass                                                          |
| `yarn tsc -p packages/postgres-plugin/tsconfig.test.json`                  | not run                             | pass                                                          |
| `yarn build` (after `tsc --build`)                                         | —                                   | pass; `dist/index.d.ts` byte-identical to the untouched build |
| `node tooling/measure-rebuild.mjs .`                                       | postgres-plugin 9307                | postgres-plugin 7966                                          |

All runs passed on the first attempt; no load-related reruns were needed.

(1) The 400-line warning flags `src/drizzle/adapter.ts` (518 physical lines),
`src/drizzle/prepared-operation.ts` (570), `src/query/filter-compiler.ts`
(522) and the unchanged `tests/query/filter-compiler.test.ts` (693). The
reference had seven such warnings (`adapter.ts` 563, `operation-executor.ts`
433, `prepared-operation.ts` 495, `relational-query-executor.ts` 480,
`introspector.ts` 434, `filter-compiler.ts` 573 and the same test). Every
production file is under the 600-line budget.
