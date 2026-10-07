# Issue 6312 plugin-authoring benchmark checkpoint

The locked 1/10/50-schema TypeScript fixture passed twice after the Plugin Kit,
testing, and community-fixture changes. Each value is the median of three
counterbalanced cold processes. Times are milliseconds; heap is MiB.

| Run | Schemas | Form    | Cold check | Edit diagnostic | Declaration bytes | Peak heap |
| --: | ------: | :------ | ---------: | --------------: | ----------------: | --------: |
|   1 |       1 | current |    2458.67 |          631.76 |            17,259 |    481.28 |
|   1 |       1 | hybrid  |    2394.11 |          427.46 |             2,944 |    439.95 |
|   1 |      10 | current |    3761.94 |         2063.70 |           136,265 |    837.78 |
|   1 |      10 | hybrid  |    2480.19 |          615.22 |            28,866 |    443.71 |
|   1 |      50 | current |    8539.35 |         6724.10 |           660,585 |   1457.73 |
|   1 |      50 | hybrid  |    3143.49 |         1288.85 |           143,546 |    544.24 |
|   2 |       1 | current |    2442.54 |          636.47 |            17,259 |    475.05 |
|   2 |       1 | hybrid  |    2356.05 |          420.28 |             2,944 |    439.97 |
|   2 |      10 | current |    3702.90 |         2091.14 |           136,265 |    839.00 |
|   2 |      10 | hybrid  |    2458.42 |          609.84 |            28,866 |    443.12 |
|   2 |      50 | current |    8485.54 |         6679.73 |           660,585 |   1465.08 |
|   2 |      50 | hybrid  |    3134.10 |         1288.37 |           143,546 |    543.57 |

Both runs passed all locked diagnostics, completion, hover, regeneration,
declaration-size, cold-check, edit-latency, and heap assertions. Compared with
issue 6311's second hybrid 50-schema checkpoint (3028.97 ms cold check and
546.37 MiB peak heap), the second run changes by approximately +3.5% and
-0.5%, respectively.

This is the unchanged issue-6301 **synthetic hybrid proof**, not a measurement
of the final production Typegen output. Its `createRegistry()` models the
source-typed proposal and does not count the complete generated `WhereInput`
declarations retained under ADR-0281. The true retained-declaration bytes and
regeneration cost must be measured separately in issue 6316 before claiming an
end-to-end Typegen reduction.

Command, run twice:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
