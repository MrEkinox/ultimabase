# Issue 6301 hybrid authoring benchmark

Recorded on 2026-09-29 from revision `afd4c8b4` on macOS 15.7.9 x86_64,
Node.js 24.20.0, and TypeScript 6.0.3.

The current form loads the real package declarations, builds Password User and
Role schemas plus every official representative plugin, runs the production
Typegen generator, and compiles the complete developer source. The hybrid form
builds the same static graph, runs the production snapshot compiler, renders
only the retained schema-name graph, and obtains plugin fields and surfaces
from source projections. It also loads all current production package
declarations as a conservative common baseline, even though later migration
will remove superseded authoring types from those packages. Both forms run in
fresh `node --expose-gc` processes.

Each row below is one raw isolated process sample. Warm completion, hover, and
diagnostic values are p95 across 40 reads after one warm-up. The summary uses
the mathematical median of two isolated samples. Times are milliseconds,
memory is MiB, and declarations are bytes.

## Raw samples

| Schemas | Form    | Sample | Regen | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Declarations | Peak heap |
| ------: | :------ | -----: | ----: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | -----------: | --------: |
|       1 | current |      1 | 29.42 |    2209.54 |  287.18 |      0.803 | 0.749 |      0.046 |             640.01 |       18,410 |    431.92 |
|       1 | current |      2 | 29.55 |    2202.96 |  285.92 |      0.888 | 0.626 |      0.042 |             625.19 |       18,410 |    430.36 |
|       1 | hybrid  |      1 | 36.46 |    2100.95 |  312.97 |      0.727 | 0.518 |      0.044 |             409.56 |        2,944 |    385.67 |
|       1 | hybrid  |      2 | 36.59 |    2014.85 |  296.65 |      0.712 | 0.629 |      0.051 |             410.80 |        2,944 |    396.46 |
|      10 | current |      1 | 49.35 |    2771.93 |  301.14 |      0.858 | 0.686 |      0.050 |            1259.32 |      137,416 |    499.57 |
|      10 | current |      2 | 47.79 |    2796.28 |  305.32 |      0.815 | 0.809 |      0.048 |            1276.95 |      137,416 |    504.59 |
|      10 | hybrid  |      1 | 55.74 |    2181.66 |  292.06 |      0.880 | 0.669 |      0.061 |             584.50 |       28,866 |    435.31 |
|      10 | hybrid  |      2 | 55.85 |    2152.36 |  295.02 |      0.914 | 0.713 |      0.050 |             579.28 |       28,866 |    433.22 |
|      50 | current |      1 | 86.08 |    5753.14 |  357.18 |      0.964 | 0.735 |      0.050 |            3947.98 |      661,736 |   1181.83 |
|      50 | current |      2 | 86.50 |    5759.91 |  371.92 |      1.015 | 0.599 |      0.060 |            3935.17 |      661,736 |   1170.37 |
|      50 | hybrid  |      1 | 93.38 |    2851.37 |  329.38 |      0.853 | 0.743 |      0.049 |            1457.67 |      143,546 |    502.43 |
|      50 | hybrid  |      2 | 91.33 |    2842.47 |  321.06 |      0.970 | 0.642 |      0.062 |            1431.87 |      143,546 |    499.72 |

Every initial cold and language-service diagnostic count was zero. Every edited
fixture produced exactly one focused diagnostic.

## Median comparison

| Schemas | Form    | Regen | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Declarations | Peak heap |
| ------: | :------ | ----: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | -----------: | --------: |
|       1 | current | 29.49 |    2206.25 |  286.55 |      0.846 | 0.687 |      0.044 |             632.60 |       18,410 |    431.14 |
|       1 | hybrid  | 36.52 |    2057.90 |  304.81 |      0.719 | 0.573 |      0.047 |             410.18 |        2,944 |    391.06 |
|      10 | current | 48.57 |    2784.11 |  303.23 |      0.836 | 0.747 |      0.049 |            1268.13 |      137,416 |    502.08 |
|      10 | hybrid  | 55.80 |    2167.01 |  293.54 |      0.897 | 0.691 |      0.056 |             581.89 |       28,866 |    434.27 |
|      50 | current | 86.29 |    5756.52 |  364.55 |      0.989 | 0.667 |      0.055 |            3941.58 |      661,736 |   1176.10 |
|      50 | hybrid  | 92.36 |    2846.92 |  325.22 |      0.911 | 0.693 |      0.055 |            1444.77 |      143,546 |    501.07 |

At 50 schemas the hybrid proof reduces cold checking by 50.5%, complete
edit-to-diagnostic latency by 63.3%, declaration output by 78.3%, and peak heap
by 57.4%. Snapshot compilation plus reduced rendering is 7.0% slower than the
current full rendering in this sample. All warm editor operations remain below
1 ms; sub-5 ms observations use a 5 ms reproducibility floor because relative
ratios at timer-noise scale are not stable across isolated processes.

The reproducible command is:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
