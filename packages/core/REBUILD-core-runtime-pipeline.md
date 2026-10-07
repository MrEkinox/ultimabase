# Core runtime-pipeline partition rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope (`packages/core/src/runtime/…`): `pipeline`, `enforcement`, `behaviors`,
`validation`, `operations`, `contributions`, `relation-filters`, `relations`,
`virtual-fields`, `nested-writes`.

## Status

Work in progress. The interrupted WIP (2 commits) compiled and passed the Core
unit and type suites, so it was continued rather than reset. It was rebased on
the current `main` (no Core change on `main` since its base). A parity review of
the WIP diff found three observable differences, all fixed:

- Runtime interceptor and enforcement option validation had moved to
  `assertExactPlainObject`, which rejects symbol keys (`Reflect.ownKeys`). The
  reference only checked enumerable string keys. Restored with
  `assertExactEnumerableKeys`.
- Composed behavior stages had started spreading the whole stage input into each
  transform envelope. The reference rebuilt each envelope with an exact key list
  and order. Restored.
- Adapter materialization snapshots had changed key order (`kind` first).
  Restored to the reference order (`current`, `kind`, `previous`).

(Design summary, line counts, test mapping and validation results are filled in
at the final checkpoint.)
