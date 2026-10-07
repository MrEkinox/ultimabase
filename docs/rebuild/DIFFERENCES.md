# Behavior differences from the reference

Every observable difference between the reconstruction and reference commit
`0ae7767f7b75dd6c640ca547f9ff85b60f46e69d` is listed here. The goal is none;
an entry exists only when reproducing the reference would require knowingly
unsafe code or when a reference defect was found.

| Area | Reference behavior | Reconstruction behavior | Reason | Test coverage |
| --- | --- | --- | --- | --- |
| hooks-plugin schema-mutation hook groups | A hook branch literally keyed `__proto__` (only reachable through `JSON.parse`/`defineProperty`) is assigned onto `Object.prototype` during normalization and silently dropped. | Rejected at startup as `Unknown schema mutation Hook branch`. | Reproducing it requires prototype-polluting code; the reference result is a latent security defect. | No reference test covers this input. |
