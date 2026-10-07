# `@ultimabase/pg-vector-plugin` rebuild notes

Reviewed against reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch `rebuild/small-plugins-b`, base `cd7dca7`) following
`docs/rebuild/PROTOCOL.md`. The public contract is unchanged: `vectorField`
(overload with `const TDimensions` / `const TOptions` and the
`CompatibleFieldOptionsInput` declaration type), `VectorFieldBuilderMethod`
(callable interface kept for hover names and JSDoc), `vectorFieldKind`,
`VectorValue`, `VectorFieldOptions`, `VectorField`, `VectorFieldValidationPlan`,
`isVectorFieldValidationPlan`, `pgVectorPlugin`, `PgVectorPlugin`, the field
family registration (`vector` builder method, `stored` context, typegen module
and value type), the GraphQL `ultimabase.graphql.field` 1.0.0 JSON wire codec,
the `schema:declare` privilege text, and every error class and message.

The built `dist/index.d.ts` and `dist/index.js` are identical to the reference
build.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | pg-vector-plugin production lines |
| --------- | --------------------------------- |
| Before    | 202                               |
| After     | 201                               |
| Reduction | 1 line                            |

## Why (almost) unchanged

The file is dominated by public types whose exact shape is checked by
`tests/vector-field.test-d.ts`, `tests/field-builder.test-d.ts`,
`tests/plugin-plan.test-d.ts`, the language-service autocomplete test and the
packed `pg-vector-field-builder` e2e (hover text, completion, JSDoc). The
runtime part is one dimension guard, one vector snapshot and one field family
declaration, each already single-purpose. The `PluginDeclarationContribution`
annotation on `vectorDeclarations` is what binds `PgVectorSource` into the
plugin type, so it stays. `src/index.ts` is listed as a page source in
`apps/website/content/docs/1.0.0/plugins/official/postgresql-vector.mdx`, so the
module keeps its path.

Only change: `pgVectorPlugin` returns `plugin(...)` directly instead of through
a single-use `instance` local.

## `as` casts

None before, none after (`as const` assertions are unchanged).

## Removed checks

None.

## Behaviour differences

None.

## Test mapping

No test was edited. All tests import `../src/index.js` or `./index.js`, which is
unchanged except for the return statement above.

## Reference bugs (documented, not fixed)

1. **Sparse arrays are accepted as vectors.** `snapshotVector` validates
   components with `value.map(...)`, which skips holes, and then copies the
   result with `immutableArray` (spread), which turns holes into `undefined`.
   Verified on the reference build:
   `snapshotScalarFieldValue(vectorField({ dimensions: 3 }), [1, , 3], 'v')`
   returns `[1, undefined, 3]`, and `vectorField({ dimensions: 3, default: [1, , 3] })`
   stores the same default. Only reachable from JavaScript (or an explicitly
   sparse literal). Kept unchanged because fixing it changes accepted inputs.
2. **`dimensions` is read three times.** `vectorField` reads
   `options.dimensions` for `assertValidDimensions`, again for the snapshot
   closure, and Core's `definePluginField` reads it a third time for the stored
   metadata. On the reference build a getter returning 2, 3, then 4 produced
   metadata `dimensions: 4`, a runtime check requiring exactly 3 values, and a
   validated value of 2 that is used nowhere. Only reachable through an accessor
   in the schema author's own declaration options; ordinary values behave
   correctly. Left unchanged because a single read would change which value the
   stored metadata keeps for such inputs, and the third read happens in Core.

## Notes

`package.json` lists `@ultimabase/plugin-kit` as a dependency that no source
file imports. It was left in place (removing it would touch `package.json` and
`yarn.lock` for no production-line gain).

## Validation

See the shared validation section in `packages/server-hono-plugin/REBUILD.md`;
the six packages of this branch were validated together on the same tree.
