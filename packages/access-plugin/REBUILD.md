# access-plugin rebuild

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`, on branch `rebuild/access-plugin`
(base `aa8a98a`). The public entry (`src/index.ts`) is byte-identical: same
runtime and type exports, signatures, generics and public JSDoc. Core and the
other packages are untouched and consumed only through their public exports.

## Production size

Measured with `node tooling/measure-rebuild.mjs .` (non-blank production lines):

|        | Lines         |
| ------ | ------------- |
| Before | 4438          |
| After  | 3639          |
| Change | -799 (-18.0%) |

About 1100 of the remaining lines are public contract: the authoring types and
their JSDoc (`authoring/contracts.ts`, `authoring/schema-mutations.ts`,
`authoring/utilities.ts`), the option source types used by typegen
(`options.ts`), contribution factories (`contributions.ts`, `targets.ts`),
diagnostics types and `index.ts`.

## Design summary

Production files: 27 before, 19 after.

| New module                        | Replaces                                                                                                                                                               | Simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authoring/declarations.ts`       | `declarations.ts`, `normalization.ts`, `field-declarations.ts`                                                                                                         | One validation boundary for schema and field declarations. Native families and custom mutations share one `normalizeStages` (`allow`/`where`/`item`) helper and one `forEachKnownKey` key validator. Rule maps are built with `Object.fromEntries`, so the key casts and the `undefined`-then-`?? {}` round trip disappear.                                                                                                                                                 |
| `authoring/plan.ts`               | `plan.ts` (barrel), `plan-contracts.ts`                                                                                                                                | Plan types plus one `accessOperationSlots` table (terminal to read branch or family). Family lookup, default lookup and compilation all read that table, which removes the unreachable "read family requires a read terminal" branch. The unused `AccessPlan.schemas` property is gone.                                                                                                                                                                                     |
| `authoring/compiler.ts`           | `compiler.ts`, `plan-mutable.ts`, `plan-finalization.ts`                                                                                                               | Drafts are the plan: rule lists are collected in mutable drafts that extend the plan interfaces and are frozen in place, instead of being copied into a second set of finalized records and lookup maps. Contribution order is unchanged (plugin contributions, then developer declarations).                                                                                                                                                                               |
| `runtime/rule-evaluation.ts`      | `rule-evaluation.ts`, `schema-mutation-access.ts`, `authoring/filter.ts`                                                                                               | One `AccessScope` (`runtime`, `plan`, `schemaPlan`, `schema`, `context`, `operation`) replaces threading `(runtime, request, plan, schemaPlan)` through every helper. Native and custom operation decisions share `assertOperationRules` (developer rules with the default, then provider rules deny-only); native and custom row filters share `evaluateFilters`. One `readExecutableOperation` holds the only operation-AST cast (Core's own readers use the same proof). |
| `runtime/execution-runtime.ts`    | same                                                                                                                                                                   | Also owns the `AccessPhase`, `AccessOperationKind` and `AccessRuleIdentity` types. Success and failure diagnostics share one `report` closure; the recursion error is built inline.                                                                                                                                                                                                                                                                                         |
| `runtime/mutation-transitions.ts` | same                                                                                                                                                                   | Scope-based signatures. The no-op "every write list empty" assertion and the flat static-false assertion became one direct `readAccessStaticWriteDecision(field) === false` denial with the same error.                                                                                                                                                                                                                                                                     |
| `runtime/item-access.ts`          | same                                                                                                                                                                   | Scope-based signatures; the upsert outcome check receives the already narrowed upsert operation.                                                                                                                                                                                                                                                                                                                                                                            |
| `runtime/output-access.ts`        | `output-access.ts`, `field-paths.ts`                                                                                                                                   | One `restricted` value and one `TResult` cast instead of two.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `runtime/dispatcher.ts`           | same                                                                                                                                                                   | Narrows `request.operation` by its discriminant instead of copying the request through `readNativeAccessRequest`/`readNativeMutationOperation`. Guard methods resolve to `true`.                                                                                                                                                                                                                                                                                            |
| `plugin.ts`                       | same                                                                                                                                                                   | `uniformDefaults` builds the boolean defaults; one `unlessDenied(run, denied)` adapter replaces `returnsDenied`/`evaluatesDenied`. Redundant annotations on private requirement constants removed.                                                                                                                                                                                                                                                                          |
| `authoring/utilities.ts`          | same                                                                                                                                                                   | `anyOf` and `allOf` share `combineDecisions(name, absorbing, decisions)`; the single-rule shortcut no longer needs a cast.                                                                                                                                                                                                                                                                                                                                                  |
| `contributions.ts`, `targets.ts`  | same                                                                                                                                                                   | One generic `requireDeclarations`; one merged guard in `readFieldKindAccessTarget` (same message).                                                                                                                                                                                                                                                                                                                                                                          |
| unchanged                         | `index.ts`, `context.ts`, `options.ts` (import path only), `authoring/contracts.ts`, `authoring/schema-mutations.ts`, `runtime/diagnostics.ts` (type import path only) |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Behavior checked to stay the same: default-deny and granular defaults,
developer-then-provider ordering (providers can only deny), Master bypass
(`master: 'bypass'` on the single protected policy), provider and developer
callback attribution (`runApplication`/`runPlugin` with owner instance),
recursion rejection, cancellation checks, diagnostics events and their field
order, hidden fields (static selection narrowing, explicit-selection denial,
value-level omission that keeps cardinality), relation source checks, prepared
target and upsert outcome checks, custom schema-mutation identity checks,
error classes, codes, public and internal messages, and the order in which
every check runs.

The emitted `dist/index.d.ts` was compared with a build of the reference. The
public exports and every public type are identical; the only differences are
internal region names, the order of private declarations, and an unused
`FrameworkError` import that the reference declaration bundle carried.

### Casts

Reference: 28 `as` assertions (counted on the TypeScript AST, `as const`
excluded). Rebuild: 11, all moved from the reference, none new:

- `readExecutableOperation`: `as unknown as ExecutableOperationAst` (was 4 sites).
- `evaluateRule`: `input as never` for the erased callback (was 2 sites).
- `normalizeAccessWhereResult`: `as WhereBuilder | WhereInput` after the guard.
- `enforceAccessOutput`: `as TResult` (was 2).
- `compiler.ts`: `ruleLists` `as RuleLists<TKey>` (was 2), nested object
  fields `as Readonly<Record<string, GenericField>>`, field-kind context
  `as never`, and the two normalized inline option reads.

## Removed checks and proofs

Each removed error could not be raised because the same input is rejected or
routed earlier on the same path:

- `access.write must be a boolean or complete fill/replace/clear object`
  (`normalizeFieldWriteAccess`, function branch): its only caller handles
  `typeof write === 'function'` first (relation write callback).
- `Native Access read family requires a read terminal`
  (`readAccessOperationDefault`): the family is `read` exactly when the
  terminal maps to one of the four read branches in the slot table.
- `Native Access requires a database operation` (`readNativeAccessRequest`)
  and `Native Access requires a database mutation`
  (`readNativeMutationOperation`): every caller returns or branches on
  `kind === 'plugin-schema-mutation'` first.
- The second upsert-kind check inside `enforceAccessMutationOutcome` (a silent
  return, not an error): the dispatcher already returns for non-upsert
  operations before snapshotting the outcome.
- No-op assertions: write lists all empty with a `true` default (asserted an
  empty list, which cannot deny), and `rules.length === 0 ? true : true`
  defaults in relation and prepared-update checks.

`Native Access singular mutation requires a prepared target` and
`Native Access missing target is valid only for an upsert create branch` are
also unreachable after the early returns, but they are kept because they
narrow the target and operation types.

## Reference bugs found

Both were confirmed by transpiling the reference `authoring/declarations.ts`
and `normalization.ts` and running them on `JSON.parse` input.

1. **Static `where` objects drop `__proto__` keys (fail-open).** The reference
   `snapshotWhereValue` copies keys with `snapshot[key] = value`. An own
   `__proto__` key (only reachable through `JSON.parse` or `defineProperty`)
   sets the prototype of the copy instead and is then lost by
   `immutableRecord`, so `{ read: { where: <{"__proto__": {...}}> } }`
   compiled to an empty restriction (`Object.keys(...)` is `[]`): the
   private row filter disappeared. The rebuild copies with
   `Object.fromEntries`, keeps the key as data, and Core then rejects it at
   evaluation with `where.__proto__ must reference a schema field`.
2. **A custom-mutation branch named `__proto__` is silently dropped.** The key
   passes the identifier pattern and the reference assigns it with
   `mutations[key] = ...`, which sets the prototype of the accumulator. A
   declaration containing only that key normalizes to `undefined` (no rule),
   and any rules declared for it are lost. The rebuild keeps it as an
   ordinary command, so compilation fails with
   `Unknown request schema mutation Access branch: access.__proto__` unless
   such a request command exists.

## Behavior differences

Only the two inputs above (both reachable only through `JSON.parse` or
`defineProperty`; no reference test covers them). Proposed rows for
`docs/rebuild/DIFFERENCES.md` (not edited by this branch):

| Area                                             | Reference behavior                                                                                                           | Reconstruction behavior                                                                                                     | Reason                                                                             | Test coverage                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| access-plugin static `where` rules               | An own `__proto__` key in a static `where` object is assigned onto the copy's prototype and dropped; the row filter is lost. | The key is kept; Core rejects it at evaluation with `where.__proto__ must reference a schema field`.                        | Reproducing it requires prototype-assigning code and fails open.                   | No reference test covers this input. |
| access-plugin custom schema-mutation Access keys | A `__proto__` command key is assigned onto the accumulator's prototype and silently dropped.                                 | Kept as a command key; compilation rejects it as `Unknown request schema mutation Access branch` unless the command exists. | Reproducing it requires prototype-assigning code and silently drops a policy rule. | No reference test covers this input. |

Internal-only differences with no observable effect: compiled plan records are
the frozen drafts (they carry the extra private `inlineOwner`/`fieldsByPath`
properties), the denied `evaluate` effect is one shared frozen record (Core
copies effects), diagnostics events are built only when an observer exists,
and the recursion stack is stored as an array instead of `{ stack }`.

## Test mapping

- No file was edited under `packages/access-plugin/tests/`, no `*.test-d.ts`,
  no internal `src/**/*.test.ts`, and no test outside the package.
- Deep imports still resolve to the same exports: `src/plugin.js`
  (`accessPlugin`), `src/targets.js` (`defineFieldKindAccessTarget`,
  `readFieldKindAccessTarget`), `src/contributions.js`,
  `src/authoring/compiler.js` (`compileAccessPlan`), `src/authoring/plan.js`
  (`accessOperationKinds`, `readAccessOperationFamily`, `AccessDefaultPolicy`),
  `src/runtime/execution-runtime.js` (`AccessExecutionRuntime`,
  `AccessExecutionDescriptor`), `src/runtime/item-access.js`
  (`requiresAccessPreparedMutationItems`) and
  `src/runtime/mutation-transitions.js` (`collectUpdateFieldValues`).
- `AccessPlan.getFields` is used only by `src/authoring/compiler.test.ts`; it
  is kept (now a filter over the frozen field plans) so its assertions stay.

## Pre-existing failures (untouched tree)

None. Baseline results on `aa8a98a`:

| Command                                                                       | Result                     |
| ----------------------------------------------------------------------------- | -------------------------- |
| `yarn build`                                                                  | pass                       |
| `yarn vitest run --project unit --project types packages/access-plugin`       | 12 files, 38 tests passed  |
| `yarn vitest run --project e2e packages/access-plugin`                        | 1 file, 2 tests passed     |
| `yarn vitest run --project postgres-e2e packages/access-plugin`               | 1 file, 6 tests passed     |
| consumers, `--project unit`                                                   | 42 files, 142 tests passed |
| consumers, `--project types`                                                  | 2 files, 6 tests passed    |
| consumers, `--project e2e`                                                    | 2 files, 10 tests passed   |
| consumers, `--project postgres-e2e`                                           | 19 files, 90 tests passed  |
| `yarn vitest run --project website-content apps/website/tests/landing-stacks` | 1 file, 7 tests passed     |
| `yarn vitest run --project e2e tests/e2e`                                     | 47 files, 219 tests passed |
| `yarn vitest run --project postgres-e2e tests/e2e`                            | 55 files, 191 tests passed |

## Validation (final tree)

Pending.
