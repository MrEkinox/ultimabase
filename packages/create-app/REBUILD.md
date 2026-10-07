# `@ultimabase/create-app` rebuild notes

Work in progress. Reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch base `c7e2ae6`). See the final version of this file for the complete
record.

## Checkpoint status

- Plugin prerequisite closure shared in `catalog.ts` (`selectedPluginIds`).
- Plan queries (`hasPlugin`, `hasDataApi`) and the `[condition, value]`
  table helper (`included`) live in `config.ts`.
- Templates use condition tables and one `pluginImports` table helper.
- Parity oracle (scratch, not committed): byte-identical output for every
  requested plugin subset x API combination, and every distinct plugin set x
  language x starter x database x manager x install.
