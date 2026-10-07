# Core partition interfaces

Core is rebuilt in five parallel partitions. Each `iface-<partition>.txt` lists,
per module, the symbols that code OUTSIDE the partition (other Core domains and
`packages/core/tests`) imports. While partitions are rebuilt in parallel these
symbols must keep their module path, name and type contract, so other partitions
and tests keep compiling. Everything else inside a partition may change.

Partitions (paths relative to `packages/core/src`):

- core-plugins: plugins, application, errors, foundation.ts, index.ts
- core-schema: schema
- core-query: query, access
- core-runtime-pipeline: runtime/{pipeline,enforcement,behaviors,validation,
  operations,contributions,relation-filters,relations,virtual-fields,nested-writes}
- core-runtime-app: the rest of runtime, private-storage

Regenerate with `cd packages/core && python3 ../../docs/rebuild/core-interfaces/compute-interfaces.py`
(writes to /tmp).
