# Issue 6310 configured HTTP/REST benchmark checkpoint

The locked 1/10/50-schema performance test passed twice after the HTTP/REST
source-typing changes. Each run compares the milestone's full generated form
(`current`) with its configured source-typed form (`hybrid`). The table below is
the second, independently sampled run: medians of three counterbalanced cold
processes. Times are milliseconds; heap is MiB. This fixture is a milestone
guard, not an isolated measurement of REST request latency.

| Schemas | Form    | Generation | Cold check | LS init | Completion | Hover | Diagnostic | Edit diagnostic | Declaration bytes | Peak heap |
| ------: | :------ | ---------: | ---------: | ------: | ---------: | ----: | ---------: | --------------: | ----------------: | --------: |
|       1 | current |      29.31 |    2383.22 |  286.12 |      0.885 | 0.702 |      0.046 |          613.27 |            17,259 |    483.95 |
|       1 | hybrid  |      35.12 |    2276.85 |  313.15 |      0.661 | 0.546 |      0.039 |          405.95 |             2,944 |    441.34 |
|      10 | current |      47.77 |    3559.93 |  308.61 |      0.891 | 0.715 |      0.047 |         2020.28 |           136,265 |    806.84 |
|      10 | hybrid  |      54.32 |    2396.15 |  299.71 |      0.785 | 0.594 |      0.042 |          589.46 |            28,866 |    444.52 |
|      50 | current |      83.80 |    8260.49 |  375.43 |      0.820 | 0.685 |      0.051 |         6494.50 |           660,585 |   1465.75 |
|      50 | hybrid  |      89.66 |    3038.42 |  324.57 |      0.811 | 0.553 |      0.047 |         1262.34 |           143,546 |    543.71 |

At 50 schemas, hybrid cold checking is 63.2% faster, edit diagnostics are
80.6% faster, declarations are 78.3% smaller, and peak heap is 62.9% lower
than the current form. Relative to issue 6301's original hybrid proof, the
50-schema cold check is 6.7% slower and peak heap is 8.5% higher, inside the
locked 10% and 15% limits. Relative to issue 6309's immediately previous
hybrid checkpoint, cold checking is 0.1% faster and edit diagnostics are 0.5%
slower; the fixture does not attribute either small difference to issue 6310.
Every cold diagnostic count was zero, and each edited fixture produced one
focused diagnostic. The tested REST option additionally passes separate
source and packed completion, diagnostic, and exact-type editor checks; its
missing nested-option JSDoc is a recorded exception, not hidden by this
benchmark.

## Raw samples

Each tuple is `generation, cold check, LS init, completion, hover, diagnostic,
edit diagnostic, peak heap`. Declaration bytes are constant per form and schema
count as shown above.

| Schemas | Form    | Sample 1                                                   | Sample 2                                                   | Sample 3                                                   |
| ------: | :------ | :--------------------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------------- |
|       1 | current | 28.64, 2362.34, 284.12, 0.86, 0.65, 0.05, 608.44, 483.95   | 29.31, 2464.13, 286.12, 1.01, 0.70, 0.04, 640.21, 440.98   | 29.87, 2383.22, 289.71, 0.89, 0.83, 0.05, 613.27, 484.63   |
|       1 | hybrid  | 35.33, 2225.01, 322.58, 0.66, 0.53, 0.04, 411.48, 435.33   | 35.12, 2289.02, 288.03, 0.63, 0.60, 0.04, 405.95, 444.13   | 34.79, 2276.85, 313.15, 0.67, 0.55, 0.04, 403.36, 441.34   |
|      10 | current | 47.86, 3559.93, 303.90, 0.91, 0.68, 0.05, 2060.98, 800.52  | 47.77, 3569.87, 314.50, 0.81, 0.72, 0.04, 2012.73, 840.15  | 46.91, 3558.21, 308.61, 0.89, 0.72, 0.05, 2020.28, 806.84  |
|      10 | hybrid  | 53.19, 2397.34, 305.35, 0.83, 0.59, 0.04, 589.46, 444.81   | 54.32, 2396.15, 287.49, 0.78, 0.67, 0.05, 573.30, 442.60   | 54.43, 2373.00, 299.71, 0.70, 0.54, 0.04, 595.88, 444.52   |
|      50 | current | 83.80, 8309.69, 386.36, 0.82, 0.69, 0.04, 6493.66, 1465.75 | 82.90, 8260.49, 375.43, 0.89, 0.69, 0.05, 6494.50, 1449.65 | 85.53, 8179.41, 372.38, 0.81, 0.60, 0.05, 6521.76, 1469.23 |
|      50 | hybrid  | 87.95, 3021.08, 331.33, 0.81, 0.57, 0.05, 1261.68, 543.71  | 89.66, 3041.96, 324.57, 0.83, 0.55, 0.05, 1262.34, 506.10  | 90.02, 3038.42, 324.26, 0.81, 0.53, 0.05, 1282.43, 550.89  |

Command:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
