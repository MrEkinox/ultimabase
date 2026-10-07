# Issue 6306 direct-execution benchmark

The direct class and immutable-result execution boundary does not alter the
source-typing fixture. This checkpoint deliberately reruns the same locked
1/10/50-schema scenario with three isolated processes per form so milestone
evolution remains comparable. Completion, hover, and cached diagnostic values
are warm reads; every other timing is a mathematical median. Times are
milliseconds and heap is MiB.

## Median checkpoint

| Schemas | Form    |  Gen. |    Cold | LS init. | Completion | Hover | Diagnostic | Edit to diagnostic | Decl. bytes | Peak heap |
| ------: | ------- | ----: | ------: | -------: | ---------: | ----: | ---------: | -----------------: | ----------: | --------: |
|       1 | current | 29.79 | 2295.38 |   288.36 |      0.869 | 0.750 |      0.050 |             613.06 |      18,410 |    469.05 |
|       1 | hybrid  | 36.38 | 2109.04 |   300.39 |      0.771 | 0.625 |      0.053 |             416.96 |       2,944 |    398.54 |
|      10 | current | 48.38 | 3015.73 |   300.96 |      1.063 | 0.836 |      0.056 |            1363.86 |     137,416 |    590.69 |
|      10 | hybrid  | 55.54 | 2229.09 |   296.55 |      0.781 | 0.609 |      0.056 |             588.98 |      28,866 |    445.61 |
|      50 | current | 86.21 | 6417.70 |   369.97 |      0.954 | 0.768 |      0.061 |            4574.17 |     661,736 |   1324.60 |
|      50 | hybrid  | 91.50 | 2900.10 |   324.80 |      0.914 | 0.586 |      0.055 |            1384.75 |     143,546 |    517.94 |

At 50 schemas, the hybrid target is 54.8% faster for cold checking, 69.7%
faster from edit to complete diagnostics, 78.3% smaller in generated
declarations, 60.9% lower in peak heap, and 12.2% faster to initialize the
language service than the current generated form measured in the same run.
Generation is 6.1% slower. Every warm editor median remains below 1 ms.

## Evolution

Against the original issue-6301 current-form baseline, the 50-schema hybrid is
49.6% faster for cold checking, 64.9% faster after an edit, 78.3% smaller in
generated declarations, 56.0% lower in peak heap, and 10.9% faster to initialize
the language service; generation is 6.0% slower.

Against issue 6305's immediately preceding hybrid checkpoint, cold checking
changed by +0.1%, edit-to-diagnostic by -0.3%, language-service initialization
by -4.6%, generation by +0.3%, and peak heap by +0.3%. Declaration bytes remain
identical. Completion, hover, and diagnostic medians moved from
`1.035/0.717/0.056` to `0.914/0.586/0.055` ms. These small host-timing changes
are directional observations, not product claims; importantly, direct Runtime
ownership introduced no TypeScript scaling regression.

## Command

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```
