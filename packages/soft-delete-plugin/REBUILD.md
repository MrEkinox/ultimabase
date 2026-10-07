# `@ultimabase/soft-delete-plugin` rebuild notes (work in progress)

Reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`, branch
`rebuild/small-plugins-a` (base `953e832`).

Checkpoint: nine single-use source-projection aliases replaced by
`TombstoneSource<Selector>` / `SurfaceSource<Selector, Surface>` (type identity
checked against the reference aliases for every mode), providers built inline
in the contribution list, Typegen reference inlined into `softDeleteNoInput`,
normalizer returns its result directly. Visibility, tombstone ownership and
replace-delete logic unchanged. Final notes follow in the final commit.
