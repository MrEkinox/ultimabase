# Core partition interfaces (retired)

Core was rebuilt in five parallel partitions. Each `iface-<partition>.txt` lists,
per module, the symbols that code OUTSIDE the partition (other Core domains and
`packages/core/tests`) imported. While the partitions were rebuilt in parallel,
these symbols had to keep their module path, name and type contract, so other
partitions and tests kept compiling.

**Status: retired.** All five partitions are merged, and the `core-integration`
pass (`packages/core/REBUILD-core-integration.md`) removed the shims that only
kept these paths alive and merged helpers duplicated across partitions. Internal
Core module paths and symbols may now change freely, provided every Core
consumer is updated. What stays frozen:

- Core's public contract: `packages/core/src/index.ts` exports, signatures,
  generics, JSDoc and `package.json` exports.
- Deep imports from tests that must not be edited (`packages/core/tests/**` and
  every `*.test-d.ts`). Internal `src/**/*.test.ts` files may only change their
  import specifiers.

The `iface-*.txt` files are kept as a historical record of the partition
boundaries; they no longer describe the current tree. Several listed paths no
longer exist (for example `runtime/behaviors/boundaries.ts`,
`schema/schema/model.ts`, `runtime/relation-filters/binding.ts` and
`runtime/virtual-fields/binding.ts`).

Partitions (paths relative to `packages/core/src`):

- core-plugins: plugins, application, errors, foundation.ts, index.ts
- core-schema: schema
- core-query: query, access
- core-runtime-pipeline: runtime/{pipeline,enforcement,behaviors,validation,
  operations,contributions,relation-filters,relations,virtual-fields,nested-writes}
- core-runtime-app: the rest of runtime, private-storage

`src/exact-object-validation.ts` belonged to no partition. After integration it
is Core's shared exact-object boundary module (plain-object and exact-key
checks used by every domain).

The historical files were generated with
`cd packages/core && python3 ../../docs/rebuild/core-interfaces/compute-interfaces.py`
(writes to /tmp).
