# Issue 6305 plugin-source benchmark

The locked milestone benchmark ran after the Core-native plugin projection,
source/packed language-service fixtures, and internal builder-contract alignment.
It uses the same isolated processes, alternating order, fixtures, and
thresholds as the
[issue-6304 checkpoint](6304-source-schema-benchmark.md). Completion, hover, and
cached diagnostic values are p95 warm reads; the checkpoint values are
mathematical medians. Times are milliseconds and heap is MiB.

This checkpoint uses three cold processes per form and schema count. Earlier
checkpoints used two; the third sample makes the median insensitive to one
host-load spike after a complete validation exposed that weakness. No budget
was relaxed, and current and hybrid forms still run in counterbalanced order.

The locked hybrid fixture represents the complete accepted milestone target.
Issue 6305 additionally verifies the real implementation through Core source
and built-package language services; the benchmark is retained unchanged so its
evolution remains comparable rather than silently favoring the new code.

## Raw samples

| Schemas | Form    | Sample |  Gen. |    Cold | LS init. | Completion | Hover | Diagnostic | Edit to diagnostic | Decl. bytes | Peak heap |
| ------: | ------- | -----: | ----: | ------: | -------: | ---------: | ----: | ---------: | -----------------: | ----------: | --------: |
|       1 | current |      1 | 29.34 | 2275.58 |   306.53 |      0.865 | 0.752 |      0.057 |             627.78 |      18,410 |    432.46 |
|       1 | current |      2 | 29.62 | 2297.31 |   300.43 |      0.856 | 0.763 |      0.049 |             622.51 |      18,410 |    432.57 |
|       1 | current |      3 | 29.85 | 2281.78 |   298.17 |      1.033 | 0.722 |      0.053 |             622.12 |      18,410 |    432.58 |
|       1 | hybrid  |      1 | 37.23 | 2146.79 |   305.49 |      0.717 | 0.543 |      0.045 |             411.47 |       2,944 |    409.19 |
|       1 | hybrid  |      2 | 36.74 | 2102.97 |   298.51 |      0.697 | 0.618 |      0.050 |             415.21 |       2,944 |    408.50 |
|       1 | hybrid  |      3 | 36.14 | 2113.74 |   295.38 |      0.735 | 0.623 |      0.056 |             417.96 |       2,944 |    408.43 |
|      10 | current |      1 | 48.70 | 3046.68 |   315.20 |      0.980 | 0.648 |      0.053 |            1376.80 |     137,416 |    601.36 |
|      10 | current |      2 | 51.18 | 3054.54 |   299.32 |      0.795 | 0.779 |      0.059 |            1384.57 |     137,416 |    582.63 |
|      10 | current |      3 | 47.60 | 3017.97 |   303.36 |      0.810 | 0.587 |      0.049 |            1368.58 |     137,416 |    591.68 |
|      10 | hybrid  |      1 | 54.28 | 2242.85 |   304.47 |      1.148 | 0.835 |      0.047 |             593.28 |      28,866 |    445.92 |
|      10 | hybrid  |      2 | 55.41 | 2254.87 |   303.97 |      1.041 | 0.587 |      0.041 |             588.67 |      28,866 |    445.55 |
|      10 | hybrid  |      3 | 55.40 | 2240.93 |   303.62 |      0.936 | 0.591 |      0.041 |             591.32 |      28,866 |    446.56 |
|      50 | current |      1 | 84.80 | 6412.67 |   375.70 |      1.000 | 0.780 |      0.053 |            4579.95 |     661,736 |   1323.51 |
|      50 | current |      2 | 84.94 | 6413.22 |   375.48 |      0.969 | 0.642 |      0.066 |            4563.34 |     661,736 |   1314.38 |
|      50 | current |      3 | 85.57 | 6505.10 |   406.46 |      0.971 | 0.801 |      0.062 |            4576.31 |     661,736 |   1323.18 |
|      50 | hybrid  |      1 | 91.23 | 2888.91 |   340.35 |      0.839 | 0.556 |      0.057 |            1375.00 |     143,546 |    515.64 |
|      50 | hybrid  |      2 | 90.45 | 2896.76 |   343.51 |      1.035 | 0.717 |      0.051 |            1388.79 |     143,546 |    516.39 |
|      50 | hybrid  |      3 | 92.03 | 2905.28 |   325.98 |      1.193 | 0.717 |      0.056 |            1397.40 |     143,546 |    517.27 |

## Median checkpoint

| Schemas | Form    |  Gen. |    Cold | LS init. | Completion | Hover | Diagnostic | Edit to diagnostic | Decl. bytes | Peak heap |
| ------: | ------- | ----: | ------: | -------: | ---------: | ----: | ---------: | -----------------: | ----------: | --------: |
|       1 | current | 29.62 | 2281.78 |   300.43 |      0.865 | 0.752 |      0.053 |             622.51 |      18,410 |    432.57 |
|       1 | hybrid  | 36.74 | 2113.74 |   298.51 |      0.717 | 0.618 |      0.050 |             415.21 |       2,944 |    408.50 |
|      10 | current | 48.70 | 3046.68 |   303.36 |      0.810 | 0.648 |      0.053 |            1376.80 |     137,416 |    591.68 |
|      10 | hybrid  | 55.40 | 2242.85 |   303.97 |      1.041 | 0.591 |      0.041 |             591.32 |      28,866 |    445.92 |
|      50 | current | 84.94 | 6413.22 |   375.70 |      0.971 | 0.780 |      0.062 |            4576.31 |     661,736 |   1323.18 |
|      50 | hybrid  | 91.23 | 2896.76 |   340.35 |      1.035 | 0.717 |      0.056 |            1388.79 |     143,546 |    516.39 |

At 50 schemas the hybrid target is 54.8% faster for cold checking, 69.7%
faster from edit to complete diagnostics, 78.3% smaller in generated
declarations, 61.0% lower in peak heap, and 9.4% faster to initialize the
language service than the current generated form. Snapshot generation is 7.4%
slower. Every hybrid warm editor p95 remains below 1.2 ms.

## Evolution from issue 6304

The 50-schema hybrid median changed by +2.0% cold, -0.8%
edit-to-diagnostic, +5.2% language-service initialization, +0.6% generation,
and +0.1% peak heap. Declaration bytes are unchanged and warm
completion/hover/diagnostic p95 remain 1.035/0.717/0.056 ms. These host timings
remain inside every locked budget and show no scaling regression. Because the
checkpoint now uses three samples, small timing deltas against the earlier
two-sample checkpoint are directional observations rather than product claims.

## Command

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
