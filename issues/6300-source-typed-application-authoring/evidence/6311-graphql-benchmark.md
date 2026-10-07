# Issue 6311 configured GraphQL benchmark checkpoint

The locked 1/10/50-schema TypeScript performance fixture passed twice after
GraphQL's direct option moved from Typegen to its configured source receipt.
Each result is the median of three counterbalanced cold processes. Times are
milliseconds; heap is MiB. The fixture compares the milestone's full generated
form (`current`) with its configured source-typed form (`hybrid`); it is not a
measurement of GraphQL request latency.

| Run | Schemas | Form    | Cold check | Edit diagnostic | Declaration bytes | Peak heap |
| --: | ------: | :------ | ---------: | --------------: | ----------------: | --------: |
|   1 |       1 | current |    2390.81 |          616.36 |            17,259 |    470.75 |
|   1 |       1 | hybrid  |    2276.50 |          420.39 |             2,944 |    439.32 |
|   1 |      10 | current |    3569.47 |         2021.32 |           136,265 |    821.00 |
|   1 |      10 | hybrid  |    2408.06 |          591.48 |            28,866 |    443.54 |
|   1 |      50 | current |    8267.39 |         6534.82 |           660,585 |   1461.83 |
|   1 |      50 | hybrid  |    3074.29 |         1270.93 |           143,546 |    552.19 |
|   2 |       1 | current |    2375.94 |          618.22 |            17,259 |    440.51 |
|   2 |       1 | hybrid  |    2237.14 |          416.09 |             2,944 |    435.48 |
|   2 |      10 | current |    3563.14 |         2019.72 |           136,265 |    847.50 |
|   2 |      10 | hybrid  |    2381.73 |          590.73 |            28,866 |    442.32 |
|   2 |      50 | current |    8335.47 |         6498.84 |           660,585 |   1463.80 |
|   2 |      50 | hybrid  |    3028.97 |         1248.49 |           143,546 |    546.37 |

At 50 schemas, both configured runs stayed faster than the generated baseline
and within issue 6301's locked cold-check and heap budgets. Compared with
issue 6310's configured 50-schema checkpoint (3038.42 ms cold check and
543.71 MiB peak heap), the second run is effectively unchanged. Both runs
passed the fixture's exact completion, hover, diagnostics, edit diagnostic,
and TypeScript budget assertions.

Command, run twice:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
