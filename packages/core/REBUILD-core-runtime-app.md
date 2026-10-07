# Core rebuild: runtime-app partition

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope: `packages/core/src/runtime/**` except `pipeline`, `enforcement`,
`behaviors`, `validation`, `operations`, `contributions`, `relation-filters`,
`relations`, `virtual-fields` and `nested-writes`, plus
`packages/core/src/private-storage/**`.

## WIP decision

The interrupted WIP commit `827e3c0` (40 files, +1506/−2452) was **continued**,
not reset. It compiled (`tsc --build packages/core`), and the Core unit
(201 files, 1267 tests) and type (73 files, 147 tests) suites passed on it.
A line-by-line review against the reference found the parity defects listed
under "WIP review fixes", plus 9 ESLint errors; all were fixed.

## Production lines (scope only, non-blank lines, same rule as `tooling/measure-rebuild.mjs`)

|        | Files | Lines     |
| ------ | ----- | --------- |
| Before | 71    | 10914     |
| After  | 60    | SEE_AFTER |

The emitted `packages/core/dist/index.d.ts` was compared with a build of `main`
(declarations sorted line by line, region comments ignored): identical.

## Design summary

Public exports, signatures, generics, JSDoc, error classes, codes, messages,
transaction and rollback order, post-commit delivery, Master provenance and
private-storage confidentiality are unchanged. Every symbol listed in
`docs/rebuild/core-interfaces/iface-core-runtime-app.txt` keeps its module path,
name and type.

The main simplification replaces per-engine side registrations with one
private reader. In the reference, each `RequestEngine` constructor registered
four WeakMap entries (adapter access, private storage, plugin-operation host,
schema-mutation host). Each consumer then re-read its own copy of the pipeline
and transaction lifetime. Now `RequestEngine` keeps its state in `#private`
fields, and one `readRequestEngineInternals` (a static-block accessor) gives
Core modules `application`, `framework`, `pipeline`, `lifetime` and `derive`.

| New module                                                | Replaces                                                            | Simplification                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/request-engine.ts`                                | same, `request-engine-construction.ts`, `operation-boundaries.ts`   | Private state read through one static-block accessor instead of 4 registrations. Terminal preparation is shared by single and batch execution. The private scope is one record instead of 4 positional parameters.                                |
| `engine/framework-engine.ts`                              | same, `engine-options.ts`, `framework-master-authority.ts`          | Master authority is a `#private` field (was a module WeakMap). Option validation lives next to its only caller.                                                                                                                                   |
| `engine/application-binding.ts`                           | same, parts of `framework-master-authority.ts`                      | `requireMasterAuthority`, `assertMasterElevationPrivilege` and `resolveTerminalContext` (explicit context, then audited Master elevation) are shared by schema commands and schema mutations, which had duplicate copies.                         |
| `engine/request-engine-batch.ts`                          | same                                                                | Projection and plain batch paths are separate loops. Options are captured by the caller.                                                                                                                                                          |
| `context/active-framework-context.ts`                     | same, `active-framework-storage.ts`                                 | The AsyncLocalStorage stores the engine itself; the derived view object (`ultimabase`, `request`) is gone.                                                                                                                                        |
| `transactions/run-transaction.ts`                         | same, `transaction-execution-storage.ts`, `transaction-lifetime.ts` | One function owns identity, callback, lifetime close, cancellation, commit, rollback and post-commit flush, in the reference order.                                                                                                               |
| `transactions/pipeline-transaction.ts`                    | same                                                                | Adapter shape checks shared with Runtime assembly (`isDatabaseAdapter`, `isDatabaseTransactionAdapter` in `database/contracts.ts`).                                                                                                               |
| `plugin-operations/request-execution.ts`                  | same, `runtime.ts` (`PluginOperationRuntime`)                       | Envelope, cancellation and transaction policy plus the attributed handler call, without a cached per-framework runtime object. `commandFailure` is shared with schema mutations.                                                                  |
| `plugin-operations/engine-integration.ts`                 | same, `transport.ts` class `CoreApplicationOperationTransport`      | Exposure validation is shared with schema mutations (`assertTransportExposureOptions`). The transport is a frozen record closing over its allowlist.                                                                                              |
| `schema-mutations/runtime.ts`                             | same (`PluginSchemaMutationRuntime`), `engine-integration.ts`       | Three functions: handler presence check at assembly, attributed resolve, attributed decode.                                                                                                                                                       |
| `schema-mutations/request-execution.ts`                   | same                                                                | Re-entry for a derived context or the automatic transaction is one closure. Context resolution uses `resolveTerminalContext`.                                                                                                                     |
| `schema-mutations/transport.ts`                           | same, `transport-exposure.ts`                                       | Exposure and the record-based transport in one module.                                                                                                                                                                                            |
| `application/ultima-base.ts`                              | same, `ultima-base-kernel.ts`                                       | Kernel and engine readers use the class `#private` fields instead of two WeakMaps. The two schema-mutation callbacks and the two "active or anonymous engine" blocks share one helper each.                                                       |
| `application/application-operation-transport-planning.ts` | same                                                                | The duplicated state, owner and privilege checks of both planner methods are one `authorizePlanning`.                                                                                                                                             |
| `application/application-request-execution.ts`            | same                                                                | Bound-framework and attributed-owner checks merged into one `enterBoundFramework`.                                                                                                                                                                |
| `private-storage/runtime.ts`                              | same                                                                | Reads the engine internals instead of its own WeakMap registration. The owner check runs in one closure per handle.                                                                                                                               |
| `persistence/plans.ts`, `persistence/execution.ts`        | same                                                                | The plan envelope is built once; a switch only selects the data shape. Canonical plan selection is one helper.                                                                                                                                    |
| others                                                    | same                                                                | Redundant identity WeakSets next to WeakMaps removed (`raw-access.ts`, `definition.ts`, `transport-capabilities.ts`, `capabilities.ts`); local exact-key loops replaced by the shared `assertExactEnumerableKeys`; proxy traps share one thrower. |

## WIP review fixes

- Root strict-object mutations (`update-one`/`delete-one` with
  `protectedPolicyDeniedAsMissing`) again raise the hidden-target error inside
  the automatic transaction callback, so the transaction rolls back and no
  post-commit effect runs. The WIP raised it after commit.
- `readRequestEngineApplication`/`readRequestEngineFramework` keep the
  reference `TypeError('Request engine owner is unavailable')` for a forged
  `RequestEngine` prototype (reachable through `runWithRequestEngine`), via a
  `#framework in engine` brand check.
- The attributed role resolver reads `resolver.hasRole` at call time, as in
  the reference (the WIP bound it at resolution time).
- The `UltimaBase` example JSDoc stays attached to the same declaration as in
  the reference.
- ESLint errors left by the WIP (`any` leaking from `instanceof` narrowing,
  an unbound method, a void-returning arrow, a non-type import) were fixed by
  restoring the reference type guards.

## Removed unreachable checks

- `'raw adapter provider is unavailable'` and
  `'private collection definition is unavailable'`: the identity WeakSet and the
  WeakMap were always written together, so the second lookup could not fail.
- `createBeforeInclusionSource`'s `query === undefined` branch: both physical
  operation kinds carry a query.
- The per-engine `'... is already registered'` / `'... is unavailable'`
  TypeErrors of the four removed registrations: they guarded the registrations
  themselves.

## Test mapping

Nothing under `packages/core/tests/**` changed, no `*.test-d.ts` changed, and no
test outside the scope changed. Internal tests changed only import specifiers:

| Test file                                               | Change                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/plugin-operations/runtime.test.ts`         | `readUltimaBaseKernel` from `../application/ultima-base-kernel.js` → `../application/ultima-base.js`                                                                                                             |
| `src/runtime/schema-mutations/request-identity.test.ts` | `readUltimaBaseEngine`, `readUltimaBaseKernel` from `../application/ultima-base-kernel.js` → `../application/ultima-base.js`; `exposeFrameworkSchemaMutations` from `./transport-exposure.js` → `./transport.js` |
| `src/runtime/transactions/transaction-lifetime.test.ts` | `TransactionLifetime` from `./transaction-lifetime.js` → `./run-transaction.js`                                                                                                                                  |

## Behavior differences

One, not in `docs/rebuild/DIFFERENCES.md` yet (outside this scope; the
coordinator should add it):

| Area                                                             | Reference                                                                                                                                                                                                                                                                                                                                                                         | Rebuild                                                                     | Reason                                                                             | Coverage                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Objects returned by `exposeOperations` / `exposeSchemaMutations` | Instances of internal classes whose TypeScript `private readonly` constructor parameters are real enumerable own properties: `exposed`/`#exposed`, `runtime` (with `execute`/`decode`/`encode`) and `createEngine`. Any holder of a transport could call the plugin runtime directly, skipping envelope, transaction-policy and exposure checks. `execute` is a prototype method. | Frozen records with exactly `operations`, `transport` and an own `execute`. | Reproducing the leak would require knowingly exposing unchecked execution handles. | No test inspects these properties. |

## Reference bugs found (documented, not fixed)

- The transport leak above.
- `UltimaBase`'s public example JSDoc is attached to the private
  `configuredSchemaNamespace` constant instead of the class, so hovering
  `UltimaBase` shows no documentation. Kept as is (moving it would change
  hover output).
- `createFrameworkEngine` accepts a function-object adapter, which
  `RuntimePipeline` stage validation then rejects; harmless, kept.

## Pre-existing failures (baseline = `main`, built in a separate worktree)

SEE_BASELINE

## Validation commands and results

SEE_RESULTS
