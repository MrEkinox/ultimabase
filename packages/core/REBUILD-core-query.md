# Core rebuild: query partition

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope: `packages/core/src/query/**` and `packages/core/src/access/**`
(partition `core-query`).

## WIP decision

An earlier agent left two unvalidated commits: `share one where operator
vocabulary and simplify execution` (28 files) and a 2-file interrupted WIP
(`query/index.ts`, `query/query/query.ts`). After rebasing onto `main`, the WIP
compiled (`yarn tsc --build packages/core`) and the Core unit and type suites
passed (274 files, 1414 tests, no type errors).

The WIP was **continued**, not reset. Every changed file was then reviewed
line by line against `main`. The fixes are listed under "WIP review fixes".

## Production lines

Non-blank lines of git-tracked production files (`*.test.ts` and `*.test-d.ts`
excluded), same rule as `tooling/measure-rebuild.mjs`:

|        | Files |              Lines |
| ------ | ----: | -----------------: |
| Before |    55 |               9276 |
| After  |    50 | 8586 (−690, −7.4%) |

`node tooling/measure-rebuild.mjs .`: Core production 60692 → 60002 lines;
repository production 109925 → 109235 lines (678 → 673 files). Test lines are
unchanged (127476 lines, 764 files). `access/**` is unchanged: its files are
public contracts and JSDoc with no duplicated logic.

## Design summary

The public contract is unchanged:

- `query/index.ts` is byte-identical to `main` except that
  `QueryOperationExecutor` is re-exported from `operations/execution.js`
  (its module merged there).
- The 1118 names exported by `dist/index.d.ts` are identical to a `main` build.
  The only declaration differences are private, non-exported type aliases
  (`OperationResultFor` helpers, `SchemaExecution*` projections,
  `QueryInclusionTargetBuilder`, the moved `QueryOperationExecutor`).
- Every symbol in `docs/rebuild/core-interfaces/iface-core-query.txt` is still
  exported from the same module path with the same type.

| New module                               | Replaces                                                                  | Simplification                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filters/primitive.ts`                   | same, the operator switch of `where-operators.ts`, `shortOperatorForKind` | One `where` key → AST kind table (`readWhereOperatorKind`, read with `Object.hasOwn`) and its inverse map (`readWhereOperatorKey`). Normalization, serialization and relation counts share it.                                                            |
| `filters/factory.ts`                     | same, `factory-support.ts`                                                | Support helpers merged into their only consumer. Operator support is one `switch`. `resolveOperatorTarget` replaces the resolve-then-assert pattern repeated in seven factories. Internal factory generics that only fed `as` casts were dropped.         |
| `filters/where-normalize.ts`             | same, `where-operators.ts`                                                | One `WhereContext` (schema, depth, ancestors) instead of three threaded parameters. Operator dispatch uses the shared table. `at` paths, counts and relationships are separate small functions.                                                           |
| `filters/where-serialize.ts`             | same                                                                      | The operator key comes from the shared table. Primitive operands are restored by one `switch`.                                                                                                                                                            |
| `filters/where-builder.ts`               | same, `where-builder-target.ts`                                           | One `#append` (with `kind` and `negate`) replaces `#append`, `#combine` and `createWhereBuilder`. One `#relationship` replaces `#relation` and `#pointer`. Target-input creation lives in the builder.                                                    |
| `filters/relation.ts`                    | same                                                                      | `resolveRelationshipTarget` is shared by `where` normalization and `WhereBuilder`. Count comparisons map through the shared table. Relation leaf guards share one `isRelationLeaf` check.                                                                 |
| `filters/logical.ts`                     | same                                                                      | Group and `not` normalization separated from the cycle guard; single-use type guards inlined.                                                                                                                                                             |
| `operations/execution.ts`                | same, `option-normalization.ts`, `executor.ts`                            | One `executeWithAmbientExecutor` for single and batch dispatch. One `requireOwnerRegistration` for owner-token checks. One `missingExecutionContext` error factory (codes, messages and details unchanged).                                               |
| `operations/results.ts`                  | same                                                                      | `OperationResultFor` dispatches on `kind` and reads schema and selection through `OperationSchema` / `OperationSelectedField`, instead of 12 nested `infer` branches (−112 lines).                                                                        |
| `operations/schema-command-execution.ts` | same                                                                      | Key contracts are inline arguments. The unique-target check is an option of `createSchemaWhereQuery`. Projections always go through `queryFromFindOneInput` (as `executeSchemaCreateOne` already did), so the "no select / no include" branches are gone. |
| `operations/schema-commands.ts`          | same                                                                      | The repeated execution-boundary projection objects are two private aliases.                                                                                                                                                                               |
| `operations/upsert.ts`                   | same                                                                      | The generic key assertion and single-use node factory are inlined. The unique index lookup is one `find`.                                                                                                                                                 |
| `query/input.ts`                         | same                                                                      | The AST is built once from independently normalized clauses instead of four `apply*` copies.                                                                                                                                                              |
| `query/query.ts`                         | same                                                                      | `#appendFilter` reuses `combineWhereExpressions`.                                                                                                                                                                                                         |
| `query/operation-execution.ts`           | same                                                                      | One `markNestedWrite` for create and update.                                                                                                                                                                                                              |
| `query/private-scope.ts`                 | same                                                                      | One `withPrivateScope` for object and relation scopes.                                                                                                                                                                                                    |
| `query/query-contracts.ts`               | same                                                                      | `QueryInclusionTargetBuilder` is `QueryInclusionTargetResult<…, never, never>`, the same type (class defaults are `never`).                                                                                                                               |
| `updates/normalize.ts`                   | same                                                                      | One `normalizeUpdateOperation` returns each node; the numeric field check is inlined.                                                                                                                                                                     |
| `clauses/selection.ts`, `pagination.ts`  | same                                                                      | One pass collects included and excluded fields; local temporaries removed.                                                                                                                                                                                |

### WIP review fixes made in this session

- `query/query.ts`: restored. The WIP moved the AST into a `#ast` field with a
  static-block `hydrate`. That changed the error on a forged receiver
  (`Reflect.get(QueryBuilder.prototype, 'ast', {})`) from
  `QueryBuilder instance has no internal AST` to the engine's private-field
  error. It also replaced `offset(0)` on an AST without pagination by an own
  `pagination: undefined` patch and dropped the typed `targetQuery` view in
  `include`. Only the `#appendFilter` simplification was kept.
- `filters/where-builder.ts`: the WIP stored state in `#private` fields, with
  the same forged-receiver message change for `schema` and `build()`. The
  `where-builder-state.ts` WeakMap module is kept (with its export, so
  `where.test.ts` needs no change). `count`, `isEmpty` and `isNotEmpty` again
  build their input with a computed field key. The WIP sent them through the
  field-path target parser, which changed the untyped-JavaScript error for a
  non-string field name (`where.5 must reference a schema field`).
- `filters/where.test.ts`: the WIP changed its import specifier; restored.
- `query/index.ts`: the WIP merged `export type {…}` blocks into inline `type`
  specifiers (formatting-only compaction). Restored, except the
  `QueryOperationExecutor` module path.
- `filters/where-serialize.ts`: the WIP read primitive leaves through the broad
  `QueryPrimitiveFilterNode` interface, with `node.values ?? []`,
  `node.isNull === true` and `node.path === undefined`. That differs from the
  reference on malformed leaves. The reference union narrowing
  (`SerializableWherePrimitive`), `'path' in node` and the truthiness test are
  restored.
- `filters/where-normalize.ts`: a relation predicate normalizes its nested
  `where` before creating its source and target schema nodes, as in the
  reference (error precedence).
- `operations/schema-commands.ts`: the execution projection alias lists
  `include` before `select`, like the reference declarations.
- `filters/logical.ts`: the WIP's record of constant nodes was replaced by the
  reference's two shared constants (simpler).

### Parity checks beyond the test suites

- `OperationResult`, `OperationRecordResult` and `OperationSourceRecordResult`:
  a temporary type file compared the new and reference definitions with a
  strict identity check (`<T>() => T extends A ? 1 : 2`) for every operation
  kind, with and without selections and inclusions, for unions, for
  `ExecutableOperationAst`, `OperationAst`, `OperationAstNode` and for
  `SchemaDefinition`. All identical. `typeToString` of the resolved results
  printed identically.
- A temporary probe test ran 303 cases in this tree and in a `main` snapshot,
  with execution mocked to capture the exact operation ASTs. It covered `where`
  normalization (all operators, error paths, own `__proto__` and `constructor`
  keys, cycles), serialization round trips, `WhereBuilder` (including untyped
  arguments and forged receivers), `QueryBuilder` clauses, read normalization,
  upsert targets, update expressions, operation options, logical filters,
  `transformQueryFilterInput` and all eight schema commands. Results,
  errors, key order, frozenness and prototypes were identical in all 303 cases.
  Neither temporary file was committed.

## Test mapping

No test file changed: nothing under `packages/core/tests/**`, no `*.test-d.ts`,
no internal `src/query/**` or `src/access/**` test, and no test outside the
scope. Every module and symbol that tests deep-import was kept, including
`filters/where-builder-state.ts` (`readWhereBuilderState`).

## Casts

No `any` and no broadened public type. Every `as` in rewritten code (from
`git diff main`, `as const` excluded):

- Moved unchanged with their code: `fieldName as unknown as
SchemaRelationFieldName<TSchema>` (relation count), the operand casts for key
  (`string | readonly string[]`), JSONPath (`QueryJsonPathExpression`) and regex
  (`QueryRegexPattern`) factories, the batch projection
  `as unknown as FindManyOperationAst<SchemaDefinition>`,
  `bindExecutionResult`'s `as TResult`, `as UpdateOperationNode<TSchema>` (two),
  `input as Readonly<Record<string, unknown>>` (nested-write marker),
  `as unknown as QueryInclusionInput<TSchema>`, `createQueryAst(schema) as
QueryInputAst<TSchema>`, `input.where as WhereInput<TSchema>`,
  `input.select as QuerySelection<TSchema>`, `input.offset as number`.
- Moved and merged (fewer occurrences than the reference):
  relation-predicate `as unknown as QueryFilterNode<TSchema>` (one cast in
  `normalizeWhereRelationship` instead of one at each of the two call sites);
  `input as WhereSource<SchemaDefinition>` in `WhereBuilder.#relationship`
  (replaces two `as unknown as WhereSource<typeof target>`); `as
Promise<readonly object[]>` in `executeBatch` (replaces two `as unknown as`);
  `expression as SerializableWherePrimitive` (replaces an `as unknown as` from a
  narrower type); `segments as [string, ...string[]]` (replaces `path as
unknown as readonly [string, ...string[]]`).
- Changed: `input.limit as number | undefined` (reference: `as number`, applied
  only when defined). The clause is now normalized unconditionally;
  `normalizeQueryLimit` validates the untrusted value either way.
- Replacing three: `createQueryRelationCount(...) as unknown as
QueryFilterNode<TSchema>` in `normalizeWhereRelationCount`. The internal
  `createQueryRelationCount` lost its unused field generics, which removed
  `target as unknown as SchemaRelationTarget<…>` (relation.ts),
  `target as unknown as RelationTarget` and `as QueryRelationCountInput`
  (where-normalize.ts).
- Removed outright: two factory return casts
  (`as QueryPrimitiveFilterNode<TSchema, TFieldName>`), two `target as
QueryFilterTarget<…>`, four `(value as number)` in relation count guards, one
  `as QueryFilterNode<TSchema>` pair on `AND`/`OR`/`NOT`, five `input as unknown
as Readonly<Record<string, unknown>>` in `input.ts`, the per-call `as Promise<…>`
  in `executeOperation` / `executeOperationBatch`, `id as
OperationObjectId<TSchema>`, `fieldName as QueryIncludableFieldName<TSchema>`
  and `mutableFieldName as NumericUpdateFieldName<TSchema>`.

## Behavior differences

None. See "Parity checks" above.

## Reference bugs found (documented, not fixed)

Both are unchanged from the reference and were confirmed in both trees by the
probe.

- `filters/target.ts` `readObjectChildFields` copies child fields onto a plain
  `{}` and looks a path segment up with `fields[segment]`. A request path
  segment such as `constructor` resolves to `Object.prototype.constructor`
  instead of `undefined`. So `{ profile: { at: [{ path: ['constructor'], eq: 1 }] } }`
  fails with the engine error
  `Cannot use 'in' operator to search for 'list' in undefined` instead of
  `query field path references unknown object field "constructor" at index 0`.
  The same lookup exists in `factory.ts` (`snapshotPartialObject`) and
  `input-transformation.ts` (`resolveStructuredPathField`). A schema object
  field declared under an own `__proto__` key would also be lost.
- `filters/input-transformation.ts` `transformRecord` rebuilds each record with
  `transformed[name] = value`. An own `__proto__` key (from `JSON.parse` in a
  transport) hits the prototype setter, so the key disappears from the
  transformed filter instead of being rejected later with
  `where.__proto__ must reference a schema field`. Other keys are unaffected,
  and the result is copied by `immutableRecord`, so no global prototype is
  changed.
- `WhereBuilder.count`/`isEmpty`/`isNotEmpty` (untyped JavaScript only): a
  `Symbol` field name becomes a computed symbol key that `Object.entries`
  ignores, so the call silently adds an always-true filter. TypeScript rejects
  the call.

## Pre-existing failures

PENDING

## Validation commands and results

PENDING
