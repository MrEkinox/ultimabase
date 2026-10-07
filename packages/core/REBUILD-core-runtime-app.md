# Core rebuild: runtime-app partition

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope: `packages/core/src/runtime/**` except `pipeline`, `enforcement`,
`behaviors`, `validation`, `operations`, `contributions`, `relation-filters`,
`relations`, `virtual-fields` and `nested-writes`, plus
`packages/core/src/private-storage/**`.

Status: in progress (checkpoint). The interrupted WIP commit `827e3c0` was
assessed and continued: it compiled, and the Core unit (201 files, 1267 tests)
and type (73 files, 147 tests) suites passed on it. A review against the
reference found the parity defects listed under "WIP review fixes".

## WIP review fixes

- Root strict-object mutations (`update-one`/`delete-one` with
  `protectedPolicyDeniedAsMissing`) again raise the hidden-target error inside
  the automatic transaction callback, so the transaction rolls back and no
  post-commit effect runs (the WIP raised it after commit).
- `readRequestEngineApplication`/`readRequestEngineFramework` keep the
  reference `TypeError('Request engine owner is unavailable')` for a forged
  `RequestEngine` prototype (reachable through `runWithRequestEngine`).
- The attributed role resolver reads `resolver.hasRole` at call time, as in
  the reference.
- The `UltimaBase` example JSDoc stays attached to the same declaration as in
  the reference.
