# typegen rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

The public contract is unchanged: every `src/index.ts` export, its signatures,
generics, literal types and public JSDoc, the generated declarations (byte for
byte, including the embedded fingerprint), the snapshot objects and their key
order, error classes, reasons, owners, paths and messages, option validation
and the atomic writer. The emitted `dist/index.d.ts` is byte-identical to the
one built from the untouched sources. Core is consumed only through
`@ultimabase/core` public exports, as before.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|        | Lines        |
| ------ | ------------ |
| Before | 3018         |
| After  | 2733         |
| Delta  | -285 (-9.4%) |

Production files: 25 before, 22 after.

## Design summary

The package keeps its two halves. The snapshot half turns a compiled
application into an inert, JSON-serializable snapshot whose `JSON.stringify`
is hashed into the fingerprint, so every record is still built with the same
key order and the same evaluation order (which decides the first error). The
generator half renders that snapshot into one declaration; every section,
property and blank line is emitted in the same order as before.

Module mapping:

| New module                           | Replaces                                                                                                                              | Simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot.ts`                        | public types and entry points of `snapshot.ts`                                                                                        | Field snapshotting moved out. Field-method references use one `snapshotReference` factory. `createTypegenSnapshot` passes the compiled application straight to `createCompiledTypegenSnapshot` (which reads the same five properties) instead of copying them into a new object.                                                                                                                                                                                                              |
| `snapshot/fields.ts`                 | stored-field part of `snapshot.ts`                                                                                                    | Built-in scalar kinds are one `Map` shared with virtual fields; plugin value lookup, optional-string reading and the `unsupported-field-kind` error factory are shared helpers. Enum values read the array or mapping in one pass. The plugin field-type conflict compares the three declared names (`valueType`, `module`, `structuralContainsType`) instead of the four copied reference properties; the containment reference always uses the value module, so both comparisons are equal. |
| `snapshot/virtual-fields.ts`         | same                                                                                                                                  | Reuses the `fields.ts` helpers; its duplicated scalar switch and optional-string reader are gone. The weaker shape check and the `Reflect.get` reads of virtual descriptors are kept as they were, so foreign values fail exactly as before.                                                                                                                                                                                                                                                  |
| `snapshot/plugin-graph.ts`           | same                                                                                                                                  | The registered-reference index computes the owner key directly and adds to one `Set` per owner (the reference copied the set for every reference). Model and schema mutation maps share one `snapshotMutations`.                                                                                                                                                                                                                                                                              |
| `generator/identifiers.ts`           | `generator/identifiers.ts`, descriptor types of `generator/types.ts`                                                                  | Enums and objects share one descriptor map, one definition list and one claim path (suffix table per kind) instead of two parallel branches. Structural signatures are module functions over a narrowed `NamedValue` type. The never-read `ObjectOccurrence` list and `objectFieldsFor` were removed.                                                                                                                                                                                         |
| `generator/types.ts`                 | same                                                                                                                                  | The identical `EnumDescriptor` and `ObjectDescriptor` became `NamedDescriptor`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `generator/imports.ts`               | same                                                                                                                                  | References are gathered in one flat list (same traversal order), and import specifiers are grouped by module while aliases are assigned.                                                                                                                                                                                                                                                                                                                                                      |
| `generator/filters/operators.ts`     | same                                                                                                                                  | Adds `scalarFilterNames`, one kind-to-name table that replaces the four maps of root, path and array filter names.                                                                                                                                                                                                                                                                                                                                                                            |
| `generator/filters/field-filters.ts` | `filters/where.ts`, path operators of `filters/structural.ts`, names of `filters/arrays.ts`                                           | Root and path filter resolution share `valueFilter` (enum, JSON, object, containment, equality) while keeping their own precedence order.                                                                                                                                                                                                                                                                                                                                                     |
| `generator/filters/declarations.ts`  | `filters/shared.ts`, `filters/scalar.ts`, `filters/relationships.ts`, declarations of `filters/structural.ts` and `filters/arrays.ts` | Shared declarations in one module, driven by small tables. The array element type is `renderScalarValue`, which replaced the duplicated `arrayItemType` switch.                                                                                                                                                                                                                                                                                                                               |
| `generator/values.ts`                | same                                                                                                                                  | `renderScalarValue` is exported for array filters; the `isListField` wrapper was inlined.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `generator/schema.ts`                | same                                                                                                                                  | `Select` and `DependencySelect` share one selection renderer; the output-only and full enum/object branches share their base declaration.                                                                                                                                                                                                                                                                                                                                                     |
| `generator/nested-writes.ts`         | same                                                                                                                                  | One `owningPointer` lookup replaces the two `mappedBy` searches.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `generator/registry.ts`              | same                                                                                                                                  | One `renderInterface` helper for the ten optional interfaces; options are deduplicated once; the option-type conflict check is a named function.                                                                                                                                                                                                                                                                                                                                              |
| `generator/contributions.ts`         | same                                                                                                                                  | Shared `typeOf` and `renderErrors` helpers.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `generator/syntax.ts`                | same                                                                                                                                  | Unreachable empty-identifier fallback removed (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `plugin.ts`                          | same                                                                                                                                  | `normalizeOptions`, `createTypegenPlugin` and `NormalizedTypegenPluginOptions` were inlined into `typegenPlugin`; the checks and messages are unchanged and run in the same order.                                                                                                                                                                                                                                                                                                            |
| `loader.ts`                          | same                                                                                                                                  | `Reflect.get` replaces the property-read cast.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `writer.ts`                          | same                                                                                                                                  | `writeGeneratedTypeFile` delegates to `writeGeneratedTypeFiles([file])`, which runs the same validation (a single file cannot conflict) before the same atomic write.                                                                                                                                                                                                                                                                                                                         |
| `generator.ts`                       | same                                                                                                                                  | Import path only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Unchanged: `errors.ts`, `index.ts`. Every path listed by website `sources`
frontmatter (`plugin.ts`, `loader.ts`, `errors.ts`, `generator.ts`,
`writer.ts`, `index.ts`, `generator/contributions.ts`) and every path named in
`docs/` or `issues/` (`snapshot/plugin-graph.ts`, `loader.test.ts`, ...) still
exists.

### `as` casts

The reference had three production type assertions; the rebuild has two, both
reference casts kept at the same boundary, and no new one:

- `candidate as GenericField` (moved from `snapshot.ts` to
  `snapshot/fields.ts`): the preceding checks prove the shape, and the original
  object must be kept because Core reads field capabilities by identity.
- `candidate as GenericOutputDescriptor` (`snapshot/virtual-fields.ts`,
  unchanged).
- Removed: `(value as Readonly<Record<PropertyKey, unknown>>)[property]` in
  `loader.ts`, now `Reflect.get(value, property)`.

`as const` literal assertions are unchanged in kind (tables and literal
record values). The new `isNamedValue` type guard checks the `kind`
discriminant it narrows on.

## Removed checks

Each removed check is unreachable; the same input is rejected earlier or
cannot exist:

- `Relationship field <path> cannot be a list` (reference
  `filters/arrays.ts` `arrayItemType`): its only caller, `renderArrayFilters`,
  first calls `arrayFilterName`. For a pointer or relation value that
  function finds no enum, object or plugin value and no `pointer`/`relation`
  entry in the kind table, so it already throws
  `Field <path> has no array filter`.
- `Field <path> has no generated named identity` (reference
  `#namedSignature`): it was only called for enum and object values. The
  signature function now takes the narrowed `NamedValue` type, so another kind
  is a compile error.
- The `'Field'` result of `fieldIdentifier` for an empty identifier:
  `typeIdentifier` never returns an empty string (an empty input becomes `_`),
  so the branch could not run.

No validation, error or message reachable from a public entry point was
removed or reworded.

## Proof of output parity

Tests are the oracle, and a parity oracle compared generated output directly
(never committed; it lived under `node_modules/.cache/rebuild-scratch`):

1. A temporary, environment-gated hook wrote every declaration produced by
   `generateApplicationTypes` and by the startup plugin, plus every
   generation error (`name`, `message`, `code`, `reason`, `owner`, `path`), to
   files named by their SHA-256.
2. With the hook built into both the reference and the rebuilt package, the
   typegen unit, types and e2e suites, the consumer unit/types/e2e/postgres-e2e
   suites and the website content suite were run. The reference produced 80
   distinct declarations and errors; the rebuild produced exactly the same 80
   (the `create-app-packed` e2e file timed out under load in both runs and was
   rerun alone for the rebuild).
   After rebasing onto the current `main`, the unit/types and e2e runs were
   repeated for both trees: both trees produced the same 47 distinct outputs.
3. A differential script ran the reference and rebuilt `dist` side by side on
   the performance fixture at 1, 2, 3, 5, 10 and 50 schemas and on the
   `examples/minimal` and `examples/todo-backend` applications: all outputs
   are identical, and both example outputs equal their committed
   `.ultimabase/schema.generated.d.ts`.

Generation time on the 50-schema performance fixture is unchanged (three
runs of 60 alternated samples: median 11.2/10.6/11.2 ms reference versus
11.1/10.8/11.2 ms rebuilt).

## Test mapping

No test changed: nothing under `packages/typegen/tests/**`, no `*.test-d.ts`,
no internal `src/**/*.test.ts` and no test outside the package. Every internal
module that a test imports (`generator.js`, `errors.js`, `loader.js`,
`plugin.js`, `writer.js`) kept its path and exports.

## Reference bugs found

None. Fields and virtual fields named `__proto__` were checked: field records
are only read with `Object.entries`, and the single computed record
(`{ [name]: field.output }`) defines an own property, so no prototype
assignment occurs.

## Behaviour differences

None.

## Pre-existing failures (untouched tree)

Measured on the untouched tree (before rebasing onto the current `main`), on
a shared machine with load averages between 25 and 125 on 12 cores:

- `yarn vitest run --project performance packages/typegen`: both tests
  failed, `hybrid-authoring` timed out at 180000 ms and `typegen-editor` at
  60000 ms. The same tests also fail on the reference build under load; see
  the performance section below.
- `yarn vitest run --project e2e <consumers> tests/e2e`: 1 failed out of 219,
  `create-app-packed.e2e.test.ts > writes a valid graph for each official
plugin selected alone` timed out at 120000 ms (already flagged in
  `docs/rebuild/HANDOFF.md`). It passes alone on the rebuilt tree.
- `yarn vitest run --project postgres-e2e packages/typegen` matches no file
  (the package has no `*.postgres.e2e.test.ts`): Vitest prints "No test files
  found" and exits 1, with no summary, on both trees.

Everything else passed.

## Validation commands and results

Run in the worktree after rebasing onto `main` `58fec8c`. "Consumers" are
the packages found by `git grep -l "@ultimabase/typegen" -- packages tests
examples apps` that have Vitest projects: `create-app`, `graphql-plugin`,
`graphql-yoga-plugin`, `password-auth-plugin`, `postgres-plugin`,
`rest-plugin`, `soft-delete-plugin` and `testing` (the `core` matches are a
README and a doc page; `examples/*` and `apps/*` matches are manifests,
generated declarations, docs and website content, covered by the pack and
`website-content` runs). The `tests/e2e` filter selects every
`*/tests/e2e/**` file, so the consumer e2e runs are the complete `e2e` and
`postgres-e2e` projects.

| Command                                                                                                                                                    | Baseline (untouched tree)                                                           | Rebuilt                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                                                                                               | pass                                                                                | pass                                                                                                                                                                                                                            |
| `yarn vitest run --project unit --project types --project performance packages/typegen`                                                                    | unit/types 28 files, 59 tests, no type errors; performance 2 failed (load timeouts) | unit/types 28 files, 59 tests, no type errors; performance 2 failed (load: one budget ratio, one timeout), see below                                                                                                            |
| `yarn vitest run --project e2e packages/typegen`                                                                                                           | 1 file, 4 tests                                                                     | 1 file, 4 tests                                                                                                                                                                                                                 |
| `yarn vitest run --project postgres-e2e packages/typegen`                                                                                                  | no test files                                                                       | no test files                                                                                                                                                                                                                   |
| `yarn vitest run --project unit --project types <consumers>`                                                                                               | 129 files, 593 tests, no type errors                                                | 129 files, 593 tests, no type errors                                                                                                                                                                                            |
| `yarn vitest run --project unit --project types packages/typegen <consumers>` on the rebased `main` (reference and rebuilt `src` swapped in the same tree) | 157 files, 652 tests                                                                | 157 files, 652 tests                                                                                                                                                                                                            |
| `yarn vitest run --project e2e <consumers> tests/e2e`                                                                                                      | 1 failed, 218 passed (47 files)                                                     | 3 failed, 216 passed (47 files) at load 122; the 3 files rerun: 2 passed, `create-app-packed` passed alone (6 tests)                                                                                                            |
| `yarn vitest run --project postgres-e2e <consumers> tests/e2e`                                                                                             | 191 passed (55 files)                                                               | 10 failed, 181 passed (55 files) at load 126 (timeouts, `EADDRINUSE 127.0.0.1:1337` and the resulting "Another UltimaBase application is active" cascade); the 3 files rerun: 2 passed, `create-app-api` passed alone (7 tests) |
| `yarn vitest run --project website-content`                                                                                                                | 17 files, 66 tests                                                                  | 17 files, 66 tests                                                                                                                                                                                                              |
| `yarn test:pack:built` (includes `typegen-generated-types`)                                                                                                | not run                                                                             | 1 failed of 173 at load 89 (10000 ms timeout in `core-archive-declarations`); rerun: 32 files, 173 tests passed                                                                                                                 |
| `yarn eslint packages/typegen`                                                                                                                             | not run                                                                             | 0 errors, 3 `max-lines` warnings (1)                                                                                                                                                                                            |
| `yarn prettier --check packages/typegen`                                                                                                                   | not run                                                                             | pass                                                                                                                                                                                                                            |
| `yarn tsc --build packages/typegen`                                                                                                                        | not run                                                                             | pass                                                                                                                                                                                                                            |
| `yarn tsc -p packages/typegen/tsconfig.test.json`                                                                                                          | not run                                                                             | pass                                                                                                                                                                                                                            |
| `yarn build` (after `tsc --build`)                                                                                                                         | —                                                                                   | pass; `dist/index.d.ts` byte-identical to the reference build                                                                                                                                                                   |
| `node tooling/measure-rebuild.mjs .`                                                                                                                       | typegen 3018                                                                        | typegen 2733                                                                                                                                                                                                                    |

(1) The warnings are the unchanged `src/generator-language-service.test.ts`
(668 lines), `src/generator.test.ts` (629) and
`tests/performance/fixtures/hybrid-authoring-contract.ts` (699). No
production file reaches the 400-line warning; the reference had
`snapshot.ts` at 548 lines.

### Performance

The two performance tests compare the "current Typegen" form with the hybrid
form. Only the current form calls the package (`generateApplicationTypes` on
`dist`), and it emits the same 590 807-byte declaration, so the
language-service, typecheck, hover and completion measurements see identical
input. Under the machine load they fail on both builds. Runs alternating the
reference `dist` and the rebuilt `dist` in the same tree:

| Run (load average) | Reference `dist`                                                                                 | Rebuilt `dist`                           |
| ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1 (25-48)          | hybrid timed out at 180 s; editor passed                                                         | hybrid timed out at 180 s; editor passed |
| 2 (21-37)          | hybrid failed `coldTypecheckDurationMs` 4852 > 4706 (hybrid against current form); editor passed | hybrid timed out; editor passed          |
| 3 (31-61)          | hybrid failed `generationDurationMs` 68.1 > 64.9 (hybrid against current form); editor passed    | hybrid and editor timed out              |
| 4 (21-54)          | hybrid and editor timed out                                                                      | hybrid timed out; editor passed          |

The 50-schema current-form probe run directly, alternating builds three
times (load around 40): generation 358/93/89 ms (reference) versus
93/88/470 ms (rebuilt); language-service initialization 502/826/1801 ms versus
1629/417/465 ms; cold typecheck 22.8/30.5/18.2 s versus 34.7/9.4/33.8 s.
The spread within one build is larger than any difference between builds.
In-process, generation of the same fixture is unchanged (see "Proof of output
parity"). A calm-machine requalification of both performance tests is still
needed, as for the other rebuilds.
