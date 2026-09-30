# Issue 6309 source-typing benchmark checkpoint

The locked 1/10/50-schema performance suite passed twice after the data-plugin
changes. This fixture compares the milestone's full generated form (`current`)
with its configured source-typed form (`hybrid`); it is a milestone guard, not
an isolated measure of PostgreSQL or Soft Delete. Each summary is the median of
three counterbalanced cold processes. Times are milliseconds, heap is MiB.

## Median checkpoint

| Schemas | Form    | Generation | Cold check | LS init | Completion | Hover | Diagnostic | Edit diagnostic | Declaration bytes | Peak heap |
| ------: | :------ | ---------: | ---------: | ------: | ---------: | ----: | ---------: | --------------: | ----------------: | --------: |
|       1 | current |      28.86 |    2386.17 |  293.47 |      0.843 | 0.604 |      0.042 |          608.07 |            17,259 |    474.25 |
|       1 | hybrid  |      35.42 |    2244.95 |  300.48 |      0.803 | 0.687 |      0.052 |          410.26 |             2,944 |    434.41 |
|      10 | current |      47.31 |    3572.61 |  315.69 |      0.774 | 0.696 |      0.046 |         2041.66 |           136,265 |    803.69 |
|      10 | hybrid  |      54.73 |    2393.66 |  302.71 |      0.825 | 0.605 |      0.040 |          594.41 |            28,866 |    444.18 |
|      50 | current |      85.03 |    8305.96 |  376.59 |      0.991 | 0.644 |      0.043 |         6525.25 |           660,585 |   1459.50 |
|      50 | hybrid  |      92.15 |    3042.16 |  331.52 |      0.869 | 0.566 |      0.050 |         1255.76 |           143,546 |    547.74 |

At 50 schemas, hybrid cold checking is 63.4% faster, edit diagnostics are
80.8% faster, declarations are 78.3% smaller, and peak heap is 62.5% lower
than the current form. Every cold diagnostic count was zero and each edited
fixture produced one focused diagnostic. Compared with issue 6301's original
hybrid proof, cold checking is 6.9% slower and peak heap is 9.3% higher, below
the locked 10% and 15% budgets. Compared with issue 6308's immediately prior
hybrid checkpoint, 50-schema cold checking is 0.7% slower and edit diagnostics
are 0.5% faster. The fixture does not prove that issue 6309 caused either
small difference.

## Raw samples

Each tuple is `generation, cold check, LS init, completion, hover, diagnostic,
edit diagnostic, peak heap`. Declaration bytes are constant per form and schema
count as shown above.

| Schemas | Form    | Sample 1                                                   | Sample 2                                                   | Sample 3                                                   |
| ------: | :------ | :--------------------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------------- |
|       1 | current | 28.86, 2466.47, 283.64, 0.84, 0.59, 0.04, 608.07, 441.69   | 29.95, 2386.17, 293.47, 0.84, 0.63, 0.04, 606.34, 481.07   | 28.14, 2340.38, 305.26, 0.88, 0.60, 0.04, 613.96, 474.25   |
|       1 | hybrid  | 36.25, 2225.89, 296.05, 0.67, 0.56, 0.05, 410.26, 434.41   | 35.15, 2276.25, 300.48, 0.80, 0.69, 0.05, 412.61, 440.51   | 35.42, 2244.95, 309.68, 0.84, 0.73, 0.06, 406.32, 434.00   |
|      10 | current | 47.53, 3576.84, 315.96, 0.74, 0.62, 0.04, 2019.91, 838.38  | 46.88, 3565.87, 315.69, 0.77, 0.73, 0.06, 2041.66, 802.42  | 47.31, 3572.61, 311.00, 0.78, 0.70, 0.05, 2045.27, 803.69  |
|      10 | hybrid  | 53.62, 2380.40, 310.61, 0.68, 0.54, 0.04, 601.34, 444.18   | 54.73, 2394.09, 302.71, 0.82, 0.61, 0.04, 586.00, 444.37   | 54.81, 2393.66, 292.02, 1.02, 0.61, 0.06, 594.41, 442.36   |
|      50 | current | 89.50, 8381.57, 377.79, 0.93, 0.67, 0.04, 6464.32, 1459.50 | 84.31, 8305.96, 376.59, 0.99, 0.64, 0.04, 6538.11, 1456.01 | 85.03, 8219.45, 376.05, 1.00, 0.64, 0.05, 6525.25, 1467.49 |
|      50 | hybrid  | 95.49, 3060.55, 331.52, 0.87, 0.69, 0.06, 1257.35, 547.74  | 91.88, 3042.16, 324.83, 0.91, 0.57, 0.05, 1255.72, 547.90  | 92.15, 3038.35, 334.21, 0.78, 0.56, 0.05, 1255.76, 547.50  |

Command:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
