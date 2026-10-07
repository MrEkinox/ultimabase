# `@ultimabase/validation-plugin` rebuild notes (work in progress)

Reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`, branch
`rebuild/small-plugins-a` (base `953e832`).

Checkpoint: arithmetic issue collection flattened (the single-path nested
`validate` helper and the seven-parameter projection helper became one local
closure), transient issue arrays no longer copied and frozen at every level
(the thrown snapshot and every issue record stay frozen), validation failure
thrown inline, duplicated `isObjectOrFunction` shared. A differential harness
compared 3000 random mutation inputs against the reference module. Final notes
follow in the final commit.
