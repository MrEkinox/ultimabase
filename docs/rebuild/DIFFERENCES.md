# Behavior differences from the reference

Every observable difference between the reconstruction and reference commit
`0ae7767f7b75dd6c640ca547f9ff85b60f46e69d` is listed here. The goal is none;
an entry exists only when reproducing the reference would require knowingly
unsafe code or when a reference defect was found.

| Area | Reference behavior | Reconstruction behavior | Reason | Test coverage |
| --- | --- | --- | --- | --- |
| hooks-plugin schema-mutation hook groups | A hook branch literally keyed `__proto__` (only reachable through `JSON.parse`/`defineProperty`) is assigned onto `Object.prototype` during normalization and silently dropped. | Rejected at startup as `Unknown schema mutation Hook branch`. | Reproducing it requires prototype-polluting code; the reference result is a latent security defect. | No reference test covers this input. |
| core `enumField` | A values mapping with an own `__proto__` key (only reachable through `JSON.parse`/`defineProperty`) loses that key from `options.values` while the value is still accepted. | The key is kept as an own key of `options.values`. | The reference result is a prototype-assignment defect; the rebuild copies entries safely. | No reference test covers this input. |
| core `decimalField(null)` | Untyped JavaScript only: fails with the engine error `Cannot read properties of null (reading 'precision')`. | Throws `TypeError: field options must be an object`, like every other scalar field factory. | Shared options validation; the reference message was an accidental engine error. | No reference test covers this input; TypeScript rejects the call. |
| core `exposeOperations` / `exposeSchemaMutations` results | Class instances whose TypeScript-`private` constructor parameters were enumerable own properties at runtime: `exposed` (map of compiled commands), `runtime` (whose `execute` skips envelope, cancellation and transaction-policy checks) and `createEngine`. | Frozen records with only `operations`, `transport` and `execute`. The public TypeScript type is unchanged. | Reproducing the old shape would knowingly hand transports unchecked execution handles. | No reference test reads those properties; no package uses them. |
